// KK Go 桌面版 —— 托盘启动器 + 服务监护 + 崩溃自愈
// 编译：见 build.ps1 第 4 步。目标 .NET Framework 4.x (csc.exe)。
// 职责（README 工作方式）：
//   * 单实例互斥（重复启动 → 通知已有实例打开窗口）
//   * 确保 %USERPROFILE%\.dsh\profiles\web 存在
//   * 若端口已有服务 → 接管；否则启动 runtime\node.exe dsh\lib\bin.js --profile web --port 18632
//   * 等待就绪 → 消息循环后弹出 WebView2 窗口（DshClient.OpenWindow）
//   * 托盘常驻：监护服务进程，崩溃/退出时自动重启（自愈），重启/停止/开机自启/退出
//   * 日志轮转：desktop.log 超 1MB 自动归档
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace DshGo
{
    internal static class Program
    {
        internal const string AppName = "KK Go";
        // 版本信息：build.ps1 在出包前会把这一段同步为 build.config.json 的版本，
        // 供「关于」「检查更新」显示与比对，确保用户看到的就是实际安装的版本。
        internal const string AppVersion = "3.1.3";
        internal const string KernelVersion = "0.2.2-rc.5";
        internal const string RepoLatestUrl = "https://api.github.com/repos/schvinkk/KK-GO-DSH-Desktop/releases/latest";
        internal const string RepoReleasesUrl = "https://github.com/schvinkk/KK-GO-DSH-Desktop/releases/latest";
        // 单实例名与端口解耦：早期版本把端口号写进 Mutex 名，导致 DSH_PORT 一变
        // 就变成"多实例"，两个进程抢同一个端口，第二个的 webserver 插件起不来
        // （dsh: startup failed: required plugins did not activate）。
        internal const string MutexName = @"Local\KKGo-SingleInstance";
        internal const int DefaultPort = 18632;
        // 注意：build.ps1 用 .NET Framework 4.0 自带的 csc.exe（C# 5），
        // 不支持 C# 6 表达式体属性（=>），故一律写成传统 get 访问器。
        internal static string AppDir { get { return AppDomain.CurrentDomain.BaseDirectory; } }

        // 数据目录（DSH_HOME）解析，优先级从高到低：
        //   1) 安装目录下 .kkgo\datadir.txt 里用户自定义的路径（托盘"更改数据目录"写入）
        //   2) 默认：安装目录下已有的 KK Go Data（覆盖升级不丢数据）→ 非 C 盘根目录
        //      （D:\KK Go Data 等）→ %USERPROFILE%\KK Go Data 兜底。
        //   ★ 绝不读取外部 DSH_HOME 环境变量（详见下方注释）。
        // 日志与 PID 独立放在安装目录下 .kkgo，跟随程序安装位置、升级时不丢失。
        // 缓存 + 手动失效：避免每次调用都扫盘符/建目录；"更改数据目录"时清缓存让它重新解析。
        static string _dataDirCache = null;
        internal static string DataDir
        {
            get
            {
                if (!string.IsNullOrEmpty(_dataDirCache)) return _dataDirCache;
                try
                {
                    string cfg = Path.Combine(AppDir, ".kkgo", "datadir.txt");
                    if (File.Exists(cfg))
                    {
                        string v = File.ReadAllText(cfg).Trim();
                        // 必须是绝对路径：相对路径（如 "D:KK Go Data"）会让 WebView2
                        // 弹「无法创建数据目录」，直接废掉整个窗口。
                        if (!string.IsNullOrEmpty(v) && Path.IsPathRooted(v) && Directory.Exists(v))
                        {
                            _dataDirCache = Path.GetFullPath(v);
                            return _dataDirCache;
                        }
                    }
                }
                catch { }

                // ★ 绝不读取外部 DSH_HOME 环境变量 ★
                // DSH_HOME 是命令行 dsh / 其他 dsh 桌面产品的全局环境变量。
                // 曾因此把 KK Go 指向用户旧 dsh 的 profile（装满 auto-continue / codex /
                // dsh-pocket 等第三方插件），dsh 启动即崩溃 exit=259、token 丢失，
                // 窗口打开就是 "dsh web authentication required"——用户侧等于"装了用不了"。
                // KK Go 的数据只认：① .kkgo\datadir.txt（托盘自定义） ② 专属默认目录。
                // 注入给 dsh 子进程时由 NativeLauncher 显式覆盖 DSH_HOME 为本目录，
                // 因此子进程拿到的是干净的 KK Go 数据目录，与外部 DSH_HOME 完全隔离。
                _dataDirCache = PickDefaultDataDir();
                return _dataDirCache;
            }
        }
        // 用户改数据目录后调用，强制下次重新解析（读到最新的 datadir.txt）
        internal static void InvalidateDataDirCache() { _dataDirCache = null; }
        // 日志 / PID 放在安装目录的 .kkgo 子目录，与程序同寿命，升级保留、卸载可控
        internal static string CfgDir
        {
            get { return Path.Combine(AppDir, ".kkgo"); }
        }
        internal static string LogPath { get { return Path.Combine(CfgDir, "desktop.log"); } }
        internal static string PidPath { get { return Path.Combine(CfgDir, "desktop.pid"); } }

        /// <summary>
        /// 选一个默认数据目录。三条硬规则，逐条都不能破：
        ///   1. 必须是【绝对路径】。RootDirectory.FullName 是 "D:\"，绝不能 TrimEnd('\\')
        ///      变成 "D:" —— Path.Combine("D:", "KK Go Data") 得到 "D:KK Go Data"
        ///      （驱动器相对路径），WebView2 拿它当 userDataFolder 会弹
        ///      「无法创建数据目录」，用户侧等于装了用不了（3.1.3 实测踩坑）。
        ///   2. 默认不占 C 盘。
        ///   3. 已存在的数据目录优先复用，保证覆盖升级不丢凭据/会话。
        /// </summary>
        static string PickDefaultDataDir()
        {
            // 0) 安装目录下的 KK Go Data：老版本把数据实际落在这里，
            //    覆盖升级必须先认它，否则用户配置"凭空消失"。且安装目录不在 C 盘时才用。
            try
            {
                string installRoot = new DirectoryInfo(AppDir).Root.FullName;
                if (char.ToUpperInvariant(installRoot[0]) != 'C')
                {
                    string existing = Path.GetFullPath(Path.Combine(AppDir, "KK Go Data"));
                    if (Directory.Exists(existing) && IsWritable(existing)) return existing;
                }
            }
            catch { }

            // 1) 第一个可用（存在且可写）的非 C 盘根目录
            try
            {
                foreach (var d in DriveInfo.GetDrives())
                {
                    if (!d.IsReady) continue;
                    string drive = d.Name;
                    if (string.IsNullOrEmpty(drive)) continue;
                    if (char.ToUpperInvariant(drive[0]) == 'C') continue;
                    string root = d.RootDirectory.FullName; // "D:\"，保留尾部反斜杠
                    // ★ 绝不 TrimEnd('\\')：D:\ -> D: 会退化成驱动器相对路径。
                    string cand = Path.GetFullPath(Path.Combine(root, "KK Go Data"));
                    try { Directory.CreateDirectory(cand); if (IsWritable(cand)) return cand; } catch { }
                }
            }
            catch { }

            // 2) 回退：用户 profile 下（一定在 C 盘，但至少是绝对路径、能用）
            return Path.GetFullPath(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "KK Go Data"));
        }

        /// <summary>目录是否可写：真实建删一个探针文件，不用 ACL 猜。</summary>
        static bool IsWritable(string dir)
        {
            try
            {
                string probe = Path.Combine(dir, ".kkgo-write-test-" + Guid.NewGuid().ToString("N"));
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
                return true;
            }
            catch { return false; }
        }

        /// <summary>
        /// 是否已配置模型凭据（DeepSeek 账号或 API Key）。
        /// dsh 的凭据统一存在 $DSH_HOME/.credentials.yaml 的 refs / records 段里，
        /// 键名形如 DEEPSEEK_API_KEY、deepseek-account-platform/default。
        /// </summary>
        internal static bool HasModelCredential()
        {
            try
            {
                string p = Path.Combine(DataDir, ".credentials.yaml");
                if (!File.Exists(p)) return false;
                string text = File.ReadAllText(p);
                return text.IndexOf("deepseek", StringComparison.OrdinalIgnoreCase) >= 0;
            }
            catch { return true; } // 读不到就不打扰用户
        }
        internal static int Port
        {
            get
            {
                // 真实监听端口优先：从 service.log 解析出的 URL 才是权威值
                if (_actualPort > 0) return _actualPort;
                if (_requestedPort <= 0) _requestedPort = ResolvePort();
                return _requestedPort;
            }
        }
        static int _requestedPort = 0;
        static int _actualPort = 0;

        internal static void SetActualPort(int p) { if (p > 0 && p != _actualPort) { _actualPort = p; Log("实际监听端口 " + p); } }

        /// <summary>
        /// 端口解析：DSH_PORT 优先；否则用默认端口，若已被占用则自动换一个空闲端口。
        /// 直接用占用端口会让 dsh 的 webserver 插件绑定失败，服务起不来，
        /// 表现为"启动后什么都没有"——所以这里必须先探端口。
        /// </summary>
        static int ResolvePort()
        {
            int p = ParsePort(Environment.GetEnvironmentVariable("DSH_PORT"));
            if (p > 0) return p;
            if (!IsPortListening(DefaultPort)) return DefaultPort;
            for (int c = 18700; c < 19000; c++)
            {
                if (!IsPortListening(c)) { Log("默认端口 " + DefaultPort + " 已被占用，自动改用 " + c); return c; }
            }
            return DefaultPort;
        }

        /// <summary>该端口上是否有进程在监听。</summary>
        internal static bool IsPortListening(int port)
        {
            try
            {
                using (var c = new System.Net.Sockets.TcpClient())
                {
                    var ar = c.BeginConnect("127.0.0.1", port, null, null);
                    if (!ar.AsyncWaitHandle.WaitOne(300)) return false;
                    c.EndConnect(ar);
                    return c.Connected;
                }
            }
            catch { return false; }
        }
        internal static bool NoOpen { get { return Environment.GetEnvironmentVariable("DSH_NO_OPEN") == "1"; } }

        static int ParsePort(string s)
        {
            int p; return int.TryParse(s, out p) && p > 0 && p < 65536 ? p : 18632;
        }

        [STAThread]
        static void Main(string[] args)
        {
            // 命令行：stop = 停止服务并退出托盘
            if (args.Length > 0 && string.Equals(args[0], "stop", StringComparison.OrdinalIgnoreCase))
            {
                StopServiceAndExit();
                return;
            }

            // 命令行：--shutdown = 彻底关闭（安装器卸载前调用）
            //
            // 为什么必须有这个：dsh 服务是一个独立的 node.exe 子进程，它会一直
            // 持有 <安装目录>\runtime\node.exe 的文件句柄。直接卸载时 Inno 删不掉
            // 这个文件，用户的"卸载"就变成"卸载一半"——目录残留、93MB 核心留在磁盘上。
            // 必须在卸载前把「托盘主进程 + dsh 服务进程树」整棵树干掉。
            if (args.Length > 0 && string.Equals(args[0], "--shutdown", StringComparison.OrdinalIgnoreCase))
            {
                ShutdownEverything();
                return;
            }

            bool createdNew;
            using (var mutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    // 已有实例：发消息让它打开窗口，然后自己退出（单实例守护）
                    try { NativeMethods.PostNotifyMessage(); } catch { }
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                // 日志/PID 放安装目录 .kkgo；用户数据（DSH_HOME）放 DataDir（可自选、默认非 C 盘）
                try { Directory.CreateDirectory(CfgDir); } catch { }
                Directory.CreateDirectory(DataDir);
                EnsureProfileTemplate();
                Log("启动 " + AppName + " port=" + Port + " args=" + string.Join(",", args));

                var tray = new TrayApp(args);
                tray.Startup();
                // 自定义消息：重复启动时已有实例收到后打开窗口
                Application.AddMessageFilter(new TrayApp.WindowMessageFilter(tray));
                tray.BeginWaitAndOpen();
                Application.Run(tray);
            }
        }

        // 停止服务：按 pid 杀进程树
        internal static void StopServiceAndExit()
        {
            try
            {
                if (File.Exists(PidPath))
                {
                    int pid;
                    if (int.TryParse(File.ReadAllText(PidPath).Trim(), out pid) && pid > 0)
                    {
                        var p = Process.GetProcessById(pid);
                        p.Kill(); // 杀 node 进程；其子进程（如有）由 node 自己管理
                        Log("已停止服务 pid=" + pid);
                    }
                    File.Delete(PidPath);
                }
            }
            catch (Exception ex) { Log("stop 失败: " + ex.Message); }
        }

        // 彻底关闭：杀掉 dsh 服务进程树 + 所有 KK Go 主进程（卸载器调用）。
        // 顺序很重要：先杀服务（它锁着 runtime\node.exe），再杀主进程。
        internal static void ShutdownEverything()
        {
            try
            {
                // 1) dsh 服务进程（独立 node.exe），连同其子孙一起杀
                if (File.Exists(PidPath))
                {
                    int pid;
                    if (int.TryParse(File.ReadAllText(PidPath).Trim(), out pid) && pid > 0)
                        KillProcessTree(pid);
                    try { File.Delete(PidPath); } catch { }
                }

                // 2) 托盘主进程（可能开了多个安装实例），排除自己
                int me = Process.GetCurrentProcess().Id;
                foreach (var p in Process.GetProcessesByName(AppName))
                {
                    try
                    {
                        if (p.Id == me) continue;
                        KillProcessTree(p.Id);
                    }
                    catch { }
                }
                Log("shutdown 完成");
            }
            catch (Exception ex) { Log("shutdown 失败: " + ex.Message); }
        }

        // 用 taskkill /T 杀整棵进程树：dsh 服务下面还可能挂着别的 node 子进程，
        // 只杀父进程的话子进程会变孤儿并继续占着文件句柄。
        static void KillProcessTree(int pid)
        {
            try
            {
                var psi = new ProcessStartInfo("taskkill", "/F /T /PID " + pid);
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                using (var p = Process.Start(psi))
                {
                    if (p != null) p.WaitForExit(15000);
                }
                Log("已结束进程树 pid=" + pid);
            }
            catch (Exception ex) { Log("KillProcessTree(" + pid + ") 失败: " + ex.Message); }
        }

        // 首次启动把内置 profile 模板复制到用户数据目录（不覆盖已有）
        static void EnsureProfileTemplate()
        {
            string src = Path.Combine(AppDir, "profiles", "web");
            string dst = Path.Combine(DataDir, "profiles", "web");
            if (!Directory.Exists(src) || Directory.Exists(dst)) return;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(dst));
                CopyDir(src, dst);
                Log("已初始化 profile 模板 -> " + dst);
            }
            catch (Exception ex) { Log("profile 复制失败: " + ex.Message); }
        }

        static void CopyDir(string src, string dst)
        {
            Directory.CreateDirectory(dst);
            foreach (var f in Directory.GetFiles(src))
                File.Copy(f, Path.Combine(dst, Path.GetFileName(f)), true);
            foreach (var d in Directory.GetDirectories(src))
                CopyDir(d, Path.Combine(dst, Path.GetFileName(d)));
        }

        // 日志轮转：超过 1MB 归档为 desktop.log.1（最多保留 3 份）
        internal static void Log(string msg)
        {
            try
            {
                if (File.Exists(LogPath) && new FileInfo(LogPath).Length > 1024 * 1024)
                    RotateLogs();
                File.AppendAllText(LogPath,
                    DateTime.Now.ToString("[yyyy-MM-dd HH:mm:ss] ") + msg + Environment.NewLine,
                    Encoding.UTF8);
            }
            catch { /* 日志失败绝不影响主流程 */ }
        }

        static void RotateLogs()
        {
            for (int i = 3; i >= 1; i--)
            {
                string from = LogPath + "." + i;
                string to = LogPath + "." + (i + 1);
                if (File.Exists(from)) { try { File.Delete(to); } catch { } try { File.Move(from, to); } catch { } }
            }
            try { File.Move(LogPath, LogPath + ".1"); } catch { }
        }
    }

    // 托盘应用：服务进程监护 + 自愈重启 + WebView2 窗口
    internal sealed class TrayApp : ApplicationContext
    {
        readonly NotifyIcon _tray;
        readonly bool _startupOnly;
        // UI 线程锚点：在 STA 主线程构造，OpenWindow 从后台线程经它切回 UI 线程，
        // 保证 WebView2/WinForms 控件始终在 STA 线程创建（否则 MTA 线程建窗体失败或空白）。
        readonly Control _uiAnchor;
        NativeLauncher.ServiceProcess _service;
        bool _stopping;
        int _restartFailures;
        bool _startupFailed;
        const int MaxRestartFailures = 5;
        const int RestartDelayMs = 1500;

        internal TrayApp(string[] args)
        {
            _startupOnly = args.Length > 0 && args[0] == "--startup";
            _tray = new NotifyIcon();
            _tray.Text = Program.AppName;
            _tray.Icon = LoadIcon();
            _tray.Visible = true;

            var menu = new ContextMenuStrip();
            menu.Items.Add("打开窗口", null, (s, e) => OpenWindow());
            menu.Items.Add("重启服务", null, (s, e) => RestartService());
            menu.Items.Add("停止服务（释放内存）", null, (s, e) => StopService());
            menu.Items.Add(new ToolStripSeparator());
            var dataDirItem = new ToolStripMenuItem("更改数据目录", null, (s, e) => ChangeDataDir());
            dataDirItem.ToolTipText = "把会话/配置/插件等数据存到别的盘（不占 C 盘），重启服务后生效";
            menu.Items.Add(dataDirItem);
            var autostart = new ToolStripMenuItem("开机自启", null, (s, e) => ToggleAutostart());
            autostart.Checked = IsAutostartEnabled();
            menu.Items.Add(autostart);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("检查更新", null, (s, e) => CheckForUpdates());
            menu.Items.Add("打开数据目录", null, (s, e) => OpenDataDir());
            menu.Items.Add("查看日志", null, (s, e) => OpenLogFile());
            menu.Items.Add("关于 KK Go", null, (s, e) => ShowAbout());
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("退出", null, (s, e) => ExitApp());
            _tray.ContextMenuStrip = menu;
            _tray.DoubleClick += (s, e) => OpenWindow();
            // 锚点控件在 STA 主线程创建，供后台线程 Invoke 回 UI 线程开窗
            _uiAnchor = new Control();
            _uiAnchor.CreateControl();
        }

        static Icon LoadIcon()
        {
            string ico = Path.Combine(Program.AppDir, "whale.ico");
            if (File.Exists(ico)) { try { return new Icon(ico); } catch { } }
            return SystemIcons.Application;
        }

        internal void Startup()
        {
            // BelowNormal 优先级，不抢资源
            try { Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
            StartService();
        }

        // 服务是否已在监听（TCP 连接探测，比 ping HTTP 更轻）
        bool IsPortOpen()
        {
            try
            {
                using (var c = new System.Net.Sockets.TcpClient())
                {
                    var ar = c.BeginConnect("127.0.0.1", Program.Port, null, null);
                    // 被防火墙静默丢弃时 SYN 无响应，WaitOne 会超时返回 false；
                    // 端口未监听时 WaitOne 返回 true 但 EndConnect 抛异常。
                    // 两种都要判为"不通"，否则会把"端口没人听"误判成"已有服务"而放弃启动。
                    if (!ar.AsyncWaitHandle.WaitOne(300)) return false;
                    c.EndConnect(ar);
                    return c.Connected;
                }
            }
            catch { return false; }
        }

        // 等待本地端口真正可连通（最多 seconds 秒）
        bool WaitPortReachable(int seconds)
        {
            for (int i = 0; i < seconds * 2; i++)
            {
                if (IsPortOpen()) return true;
                Thread.Sleep(500);
            }
            return IsPortOpen();
        }

        // ============================================================
        // 本机防火墙拦截回环的自愈
        // ------------------------------------------------------------
        // 现象：dsh 服务进程正常启动、端口也确实 LISTENING，但任何对本机
        // 127.0.0.1:<port> 的连接都会超时。原因不是 dsh，而是 Windows Defender
        // 防火墙按"程序"过滤入站包：内置的便携 node.exe 不在任何放行规则里，
        // 于是它监听的回环端口被静默丢包（对照实验：有放行规则的 node 0.03s
        // 连通，无规则的便携 node 6s 超时）。
        // 用户侧表现：托盘图标有了、进程也起来了，但界面永远是一张空白/错误页。
        //
        // 防火墙规则必须管理员权限才能加，所以这里在发现被拦截时弹窗征询，
        // 由用户点一次"修复"，触发 UAC 放行；随后重新探测并继续开窗。
        // ============================================================

        // 服务已报出可用地址，但端口连不上 —— 典型的被防火墙丢包
        bool IsLocalAccessBlocked()
        {
            return HasClientUrl() && !IsPortOpen();
        }

        // 以管理员权限添加内置 node 的入站放行规则
        bool AddFirewallRuleElevated()
        {
            try
            {
                string node = Path.Combine(Program.AppDir, "runtime", "node.exe");
                if (!File.Exists(node)) { Program.Log("找不到内置 node.exe，跳过防火墙修复"); return false; }
                // 用 PowerShell 的 New-NetFirewallRule：单引号里的路径可以带空格，
                // 整条命令用双引号包住交给 powershell 自己解析，避免多层转义出错。
                string ps = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command \"New-NetFirewallRule " +
                            "-DisplayName 'KK Go 内置运行时' -Direction Inbound -Program '" + node + "' " +
                            "-Action Allow -Profile Any -ErrorAction Stop | Out-Null\"";
                var psi = new ProcessStartInfo("powershell.exe", ps);
                // 必须 UseShellExecute=true：Verb="runas" 只有走 ShellExecute 才能触发 UAC。
                // 顺带绕开了 ProcessStartInfo.EnvironmentVariables 的重复键缺陷（UseShellExecute
                // 时 .NET 不会去字典化环境变量）。
                psi.UseShellExecute = true;
                psi.Verb = "runas";
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                using (var p = Process.Start(psi))
                {
                    if (p != null) p.WaitForExit(30000);
                }
                Program.Log("已请求添加防火墙放行规则（UAC）");
                return true;
            }
            catch (Exception ex)
            {
                // 用户取消 UAC 时抛 Win32Exception(1223)，属正常路径
                Program.Log("添加防火墙规则失败: " + ex.Message);
                return false;
            }
        }

        // 弹窗征询用户是否修复（必须在 UI 线程）
        bool AskFixFirewallUi()
        {
            try
            {
                DialogResult r = MessageBox.Show(
                    "Windows 防火墙拦截了 KK Go 的本地服务端口（127.0.0.1:" + Program.Port + "），\r\n" +
                    "服务已经在运行，但界面无法加载。\r\n\r\n" +
                    "是否立即添加放行规则？需要管理员权限（会弹出一次 UAC 确认）。",
                    Program.AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                return r == DialogResult.Yes;
            }
            catch (Exception ex)
            {
                Program.Log("防火墙提示失败: " + ex.Message);
                return false;
            }
        }

        // 在任意线程调用：自动切到 UI 线程弹窗
        bool AskFixFirewall()
        {
            if (_uiAnchor != null && _uiAnchor.InvokeRequired)
            {
                bool res = false;
                try { _uiAnchor.Invoke(new Action(() => { res = AskFixFirewallUi(); })); }
                catch (Exception ex) { Program.Log("防火墙提示切线程失败: " + ex.Message); return false; }
                return res;
            }
            return AskFixFirewallUi();
        }

        // 保证界面能加载：必要时修复防火墙。返回 true 表示本地可访问
        bool EnsureLocalAccess()
        {
            // 给服务一点自举时间：进程刚起来时监听可能还没就绪
            if (WaitPortReachable(10)) return true;
            if (!IsLocalAccessBlocked())
            {
                // 不是被拦截（服务可能还在启动），再给一段宽限时间
                return WaitPortReachable(20);
            }
            Program.Log("服务已就绪但本地端口不可达，判定被本机防火墙拦截");
            if (!AskFixFirewall()) return false;
            if (!AddFirewallRuleElevated()) return false;
            // 规则生效后新的连接即可通过
            bool ok = WaitPortReachable(20);
            if (ok)
            {
                Program.Log("防火墙规则生效，本地端口已可达");
                // 若窗口已经开着（托盘里再次点开），把之前加载失败的错误页刷掉
                try { DshClient.Reload(); } catch { }
            }
            return ok;
        }

        void StartService()
        {
            if (IsPortOpen()) { Program.Log("端口已有服务，接管"); return; }
            string node = Path.Combine(Program.AppDir, "runtime", "node.exe");
            string bin = Path.Combine(Program.AppDir, "dsh", "lib", "bin.js");
            if (!File.Exists(node) || !File.Exists(bin))
            {
                Program.Log("缺少 node.exe 或 bin.js，无法启动服务");
                MessageBox.Show("安装不完整：缺少内置运行时或 dsh 内核，请重新安装。", Program.AppName,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            try
            {
                // 启动前清掉上次崩溃留下的写锁。
                // DSH 的 atomic-write 用 `<文件>.lock` 做写锁（内容是被占用的 pid），
                // 正常流程结束会 rm 掉；但进程被强杀 / 删文件被宿主拦截时，锁会留在盘上。
                // 留下的锁会让下一次启动一直「timed out waiting for the writer lock」，
                // 表现为界面永远转圈 / 404，而真正的原因藏在日志深处。
                // 这里只删「属主进程已经不在了」的锁 —— 还在跑的实例的锁必须留着，
                // 否则两个进程同时写同一个凭据文件，那才是真的把数据写坏。
                CleanStaleLocks(Program.DataDir);
                // 关键：不能用 ProcessStartInfo。
                // .NET Framework 的 ProcessStartInfo.EnvironmentVariables 是 StringDictionary
                // （大小写不敏感），而 Windows 环境块常同时存在 Path / PATH / path 三个变体，
                // 字典化时直接抛 ArgumentException("已添加项。字典中的关键字:Path...")，
                // 结果是 .exe 能起来但 dsh 服务永远起不来，用户看到"装了却用不了"。
                // 这里改用 Win32 CreateProcess + 自建最小环境块，绕开该字典。
                string nodePath = Path.Combine(Program.AppDir, "dsh", "node_modules");
                // 数据目录（DSH_HOME）：把 dsh 全部用户数据指到 DataDir（可自选、默认不占 C 盘）
                string dshHome = Program.DataDir;
                // ⚠ 参数顺序有讲究：dsh 的启动器选项（--profile/--patch）必须排在 app 自己的
                // 参数（--no-open/--port）之前。一旦先出现 app 的未知选项，commander 的
                // passThroughOptions 会把后面所有参数原样透传给 app，--patch 就会变成
                // "unknown option '--patch'"，品牌覆盖层直接失效。
                string args = "\"" + bin + "\" --profile web";
                string brandPatch = Path.Combine(Program.AppDir, "profiles", "kkgo.patch.yml");
                if (File.Exists(brandPatch)) args += " --patch \"" + brandPatch + "\"";
                args += " --no-open --port " + Program.Port;
                var svc = NativeLauncher.Start(node, args, Program.AppDir, nodePath, dshHome);
                _service = svc;
                File.WriteAllText(Program.PidPath, svc.ProcessId.ToString());
                Program.Log("服务已启动 pid=" + svc.ProcessId);
                // 监控线程：检测服务意外退出并触发自愈重启
                StartWatch(svc);
                // 启动看护：进程起来了不等于服务起来了。
                // dsh 的 webserver 插件绑定端口失败时，node 进程会启动后立刻退出，
                // 之前的表现是"点了没反应 + 无限重启"，用户完全看不到原因。
                WatchStartup(svc);
            }
            catch (Exception ex) { Program.Log("启动服务失败: " + ex.Message); }
        }

        // 启动看护：30 秒内必须出现带 token 的访问地址，否则判定启动失败并给出真实原因
        void WatchStartup(NativeLauncher.ServiceProcess svc)
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    for (int i = 0; i < 30; i++)
                    {
                        if (_stopping) return;
                        if (HasClientUrl()) { Program.Log("服务启动完成"); return; }
                        if (svc.HasExited) { ReportStartupFailure(svc); return; }
                        Thread.Sleep(1000);
                    }
                    if (!HasClientUrl()) ReportStartupFailure(svc);
                }
                catch (Exception ex) { Program.Log("启动看护异常: " + ex.Message); }
            });
        }

        // 启动失败：把 dsh 真正打印的原因挖出来，用原生对话框告诉用户
        void ReportStartupFailure(NativeLauncher.ServiceProcess svc)
        {
            if (_startupFailed) return;
            _startupFailed = true;
            int code = -1;
            try { code = svc.ExitCode; } catch { }
            string tail = ReadServiceLogTail();
            Program.Log("服务启动失败 exit=" + code + " 日志: " + tail);

            string reason;
            if (tail.IndexOf("timed out waiting for the writer lock", StringComparison.OrdinalIgnoreCase) >= 0)
                reason = "上次退出留下了没清掉的写锁，导致服务起不来。已尝试自动清理，请关闭 KK Go 后重新打开。";
            else if (tail.IndexOf("required plugins did not activate", StringComparison.OrdinalIgnoreCase) >= 0)
                reason = "本地端口被占用或服务组件启动失败（dsh 报 required plugins did not activate）。";
            else if (tail.IndexOf("EADDRINUSE", StringComparison.OrdinalIgnoreCase) >= 0)
                reason = "本地端口被其他程序占用。";
            else if (tail.IndexOf("Cannot find module", StringComparison.OrdinalIgnoreCase) >= 0)
                reason = "内置运行时文件不完整（缺少模块），请重新安装。";
            else
                reason = "内置服务未能正常启动。";

            try
            {
                ShowOnUi(delegate
                {
                    MessageBox.Show(
                        reason + "\r\n\r\n端口：" + Program.Port + "\r\n\r\n" +
                        "详细信息（service.log 末尾）：\r\n" + tail,
                        Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                });
            }
            catch { }
        }

        // 读取 service.log 末尾（dsh 服务进程会长期持有该文件的写句柄，
        // 必须用 FileShare.ReadWrite 打开，否则抛共享冲突）
        static string ReadServiceLogTail()
        {
            try
            {
                string p = Path.Combine(Program.AppDir, "service.log");
                if (!File.Exists(p)) return "(service.log 不存在)";
                using (var fs = new FileStream(p, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    int len = (int)Math.Min(fs.Length, 4000);
                    fs.Seek(-len, SeekOrigin.End);
                    byte[] buf = new byte[len];
                    fs.Read(buf, 0, len);
                    string s = Encoding.UTF8.GetString(buf);
                    if (s.Length > 1200) s = s.Substring(s.Length - 1200);
                    return s.Trim();
                }
            }
            catch (Exception ex) { return "(读取失败: " + ex.Message + ")"; }
        }

        /// <summary>
        /// 清理上次异常退出留下的 DSH 写锁。
        ///
        /// DSH 的 @deepseek-ai/dsh-atomic-write 用 `&lt;文件&gt;.lock` 做写锁，锁文件里写的是
        /// 占用的进程 pid，正常结束会删掉。但进程被强杀、或删除动作被宿主环境拦截时，
        /// 锁会留在盘上；下一次启动就永远卡在
        /// "atomic-write: timed out waiting for the writer lock at ..."，
        /// 表现为服务起不来、界面只有 404，而真正原因埋在日志里。
        ///
        /// 判定规则（宁可漏删，绝不误删）：
        ///   · 锁文件里必须是一个能解析成 pid 的整数；
        ///   · 该 pid 必须已经不在运行（否则是活着的实例在持锁，碰它就是数据竞争）。
        ///   · `.lock.takeover-*` 是 DSH 接管锁时的中间态，主人也是同一个 pid，一并清。
        /// </summary>
        static void CleanStaleLocks(string dataDir)
        {
            try
            {
                if (string.IsNullOrEmpty(dataDir) || !Directory.Exists(dataDir)) return;
                string[] locks = Directory.GetFiles(dataDir, "*.lock", SearchOption.TopDirectoryOnly);
                string[] takeovers = Directory.GetFiles(dataDir, "*.lock.takeover-*", SearchOption.TopDirectoryOnly);
                var all = new List<string>(locks);
                all.AddRange(takeovers);
                foreach (string path in all)
                {
                    string owner;
                    try
                    {
                        using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        {
                            byte[] buf = new byte[64];
                            int n = fs.Read(buf, 0, buf.Length);
                            owner = Encoding.UTF8.GetString(buf, 0, n).Trim();
                        }
                    }
                    catch { continue; }

                    int pid;
                    if (!int.TryParse(owner, out pid) || pid <= 0) continue;   // 认不出主人 → 不碰
                    if (IsProcessAlive(pid)) continue;                        // 主人还活着 → 不碰
                    try
                    {
                        File.Delete(path);
                        Program.Log("清理残留锁: " + Path.GetFileName(path) + " (pid " + pid + " 已退出)");
                    }
                    catch { }
                }
            }
            catch (Exception ex) { Program.Log("清理残留锁异常: " + ex.Message); }
        }

        /// <summary>进程是否还在跑。开了 PROCESS_QUERY_LIMITED_INFORMATION 就够。</summary>
        static bool IsProcessAlive(int pid)
        {
            try
            {
                using (var p = System.Diagnostics.Process.GetProcessById(pid))
                    return !p.HasExited;
            }
            catch (ArgumentException) { return false; }   // pid 不存在 → 已退出
            catch { return true; }                          // 查不到就保守当活着，别误删
        }

        // 在 UI 线程执行（托盘应用必须从 STA 线程弹窗）
        void ShowOnUi(Action action)
        {
            try
            {
                if (_uiAnchor != null && _uiAnchor.InvokeRequired)
                {
                    _uiAnchor.BeginInvoke(action);
                }
                else action();
            }
            catch { }
        }

        // 首次运行引导：尚未配置 DeepSeek 凭据时，web 界面会弹一个挡住全部功能的
        // 「开始使用」弹窗。用户看到的是"整个应用都不能用"，而不是"还没登录"。
        // 这里先用原生对话框把原因讲清楚，并且只提示一次。
        void ShowOnboardingIfNeeded()
        {
            try
            {
                string marker = Path.Combine(Program.DataDir, "onboarding.done");
                if (File.Exists(marker)) return;
                if (!Program.HasModelCredential())
                {
                    Program.Log("未检测到 DeepSeek 凭据，显示首次运行引导");
                    ShowOnUi(delegate
                    {
                        MessageBox.Show(
                            "KK Go 还没有连接你的 DeepSeek 账号。\r\n\r\n" +
                            "完成一次登录（DeepSeek 账号或 API Key）后，对话、命令、技能与插件等" +
                            "全部功能即可使用；你的项目和文件始终保存在本机。\r\n\r\n" +
                            "在窗口中央的「开始使用」弹窗里点「登录」完成授权即可。",
                            Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                    });
                }
                File.WriteAllText(marker, DateTime.Now.ToString("s"));
            }
            catch (Exception ex) { Program.Log("首次运行引导失败: " + ex.Message); }
        }

        // 监控服务进程：退出即触发自愈重启（用轮询替代 Process.Exited 事件，
        // 因为原生句柄不走 .NET 的进程事件机制）。
        void StartWatch(NativeLauncher.ServiceProcess svc)
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    while (!_stopping)
                    {
                        if (svc.WaitForExit(2000)) { ServiceExited(svc); return; }
                    }
                }
                catch { }
            });
        }

        // 崩溃自愈核心：服务意外退出 → 延迟自动重启；连续失败则提示用户
        void ServiceExited(NativeLauncher.ServiceProcess svc)
        {
            if (_stopping) return;
            // 启动阶段就已经失败并报过错：不再自愈重启，避免无限重启刷屏
            if (_startupFailed) { Program.Log("启动已失败，跳过自愈重启"); return; }
            int code = -1;
            try { code = svc.ExitCode; } catch { }
            Program.Log("服务意外退出 exit=" + code + "，准备自愈重启");
            ThreadPool.QueueUserWorkItem(_ =>
            {
                Thread.Sleep(RestartDelayMs);
                if (_stopping) return;
                if (IsPortOpen()) return; // 已被别的实例接管
                _restartFailures++;
                if (_restartFailures > MaxRestartFailures)
                {
                    Program.Log("连续重启失败，停止自动重启并提示用户");
                    _tray.ShowBalloonTip(5000, "服务反复崩溃",
                        "已连续重启失败，请查看 desktop.log 或手动重启。", ToolTipIcon.Warning);
                    return;
                }
                StartService();
                if (IsPortOpen()) _restartFailures = 0; // 恢复成功，清零计数
            });
        }

        internal void RestartService()
        {
            StopService();
            Thread.Sleep(500);
            _restartFailures = 0;
            StartService();
            Program.Log("手动重启服务");
        }

        // 更改数据目录：让用户把会话/配置/插件数据挪到自选的盘（不占 C 盘）。
        // 写入 安装目录\.kkgo\datadir.txt，重启服务后生效（DSH_HOME 随服务进程注入）。
        void ChangeDataDir()
        {
            try
            {
                using (var dlg = new FolderBrowserDialog())
                {
                    string init = Program.DataDir;
                    try { dlg.SelectedPath = Directory.GetParent(init) != null ? Directory.GetParent(init).FullName : init; } catch { }
                    dlg.Description = "选择 KK Go 的数据存放位置（会话、配置、插件、凭据等）";
                    if (dlg.ShowDialog() != DialogResult.OK) return;
                    string chosen = dlg.SelectedPath;
                    if (string.IsNullOrEmpty(chosen)) return;
                    Directory.CreateDirectory(chosen);
                    string cfg = Path.Combine(Program.AppDir, ".kkgo", "datadir.txt");
                    Directory.CreateDirectory(Path.GetDirectoryName(cfg));
                    File.WriteAllText(cfg, chosen);
                    Program.InvalidateDataDirCache(); // 让紧接着的 RestartService→StartService 读到新路径
                    Program.Log("数据目录已更改为 " + chosen + "，重启服务生效");
                    MessageBox.Show(
                        "已把数据目录设为：\r\n" + chosen +
                        "\r\n\r\n正在重启服务使其生效。", Program.AppName,
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                    RestartService();
                }
            }
            catch (Exception ex) { Program.Log("更改数据目录失败: " + ex.Message); }
        }

        void StopService()
        {
            _stopping = true;
            // 优先用原生句柄精确终止；句柄不可用时回退到 pid 文件
            if (_service != null)
            {
                try { _service.Kill(); } catch { }
                try { _service.Dispose(); } catch { }
                _service = null;
            }
            Program.StopServiceAndExit();
            _stopping = false;
        }

        // 等待服务就绪（最多 150 秒），就绪后弹 WebView2 窗口
        internal void BeginWaitAndOpen()
        {
            if (_startupOnly || Program.NoOpen) return;
            ThreadPool.QueueUserWorkItem(_ =>
            {
                for (int i = 0; i < 150; i++)
                {
                    // 必须等 token 地址出现：dsh 根路径不带 token 会拒绝，
                    // 只探端口通会导致窗口打开是一片空白/错误页。
                    if (HasClientUrl())
                    {
                        Program.Log("服务就绪，打开客户端窗口");
                        OpenWindow();
                        return;
                    }
                    Thread.Sleep(1000);
                }
                Program.Log("等待服务超时（150s）");
                _tray.ShowBalloonTip(5000, "启动超时", "服务未在 150 秒内就绪，请查看日志。", ToolTipIcon.Warning);
            });
        }

        // service.log 里是否已出现带 token 的访问地址
        bool HasClientUrl()
        {
            string u; int p;
            return TryParseClientUrl(out u, out p);
        }

        // 从 service.log 末尾解析 dsh 打印的访问地址，并记录真实监听端口
        bool TryParseClientUrl(out string url, out int port)
        {
            url = null; port = 0;
            try
            {
                string logPath = Path.Combine(Program.AppDir, "service.log");
                if (!File.Exists(logPath)) return false;
                using (var fs = new FileStream(logPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    // token URL 在"启动完成"时打印一次；旧会话日志刷屏会把它顶到很前面，
                    // 只读末尾 8192 字节会漏掉 → 回退到无 token 根路径 → 401。
                    // 读末尾 256KB，并取【最后一个】匹配（最新一次启动的 token 才是有效的）。
                    int len = (int)Math.Min(fs.Length, 262144);
                    fs.Seek(-len, SeekOrigin.End);
                    byte[] buf = new byte[len];
                    fs.Read(buf, 0, len);
                    string text = Encoding.UTF8.GetString(buf);
                    var matches = Regex.Matches(text, @"http://127\.0\.0\.1:(\d+)/\?token=[A-Za-z0-9_\-]+");
                    if (matches.Count == 0) return false;
                    var m = matches[matches.Count - 1];
                    url = m.Value;
                    int parsed;
                    if (int.TryParse(m.Groups[1].Value, out parsed)) port = parsed;
                    Program.SetActualPort(port);
                    return true;
                }
            }
            catch { return false; }
        }

        void OpenWindow()
        {
            // 开窗前必须确认本地端口真的连得上（可能被本机防火墙拦截）。
            // 这一步含等待与 UAC 弹窗，绝不能占用 UI 线程，所以整体丢到后台线程，
            // 真正建窗时再切回 UI 线程。
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    bool reachable = EnsureLocalAccess();
                    // 端口不通也要开窗。
                    // 以前这里是直接 return —— 用户看到的现象是"双击了图标，什么都没发生"，
                    // 既没有界面也没有提示，最难排查。现在至少有个窗口 + 一条明确出路。
                    OpenWindowNow();
                    if (!reachable)
                    {
                        Program.Log("本地端口仍不可达，已开窗并给出处理办法");
                        ShowOnUi(delegate
                        {
                            MessageBox.Show(
                                "Windows 防火墙仍在拦截 KK Go 的本地服务端口（127.0.0.1:" + Program.Port + "）。\r\n" +
                                "服务已经在运行，但界面暂时无法加载。\r\n\r\n" +
                                "处理办法：打开「Windows 安全中心 → 防火墙和网络保护 → 允许应用通过防火墙」，\r\n" +
                                "允许「KK Go」通过专用网络；或在安全软件中放行本程序目录下的 runtime\\node.exe。\r\n\r\n" +
                                "放行后关闭并重新启动 KK Go 即可正常使用。",
                                Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        });
                        return;
                    }
                    // 先把"还没登录"这件事讲清楚（窗口已经打开，弹窗会盖在应用之上）
                    ShowOnboardingIfNeeded();
                }
                catch (Exception ex) { Program.Log("开窗流程异常: " + ex.Message); }
            });
        }
        // 真正开窗：WebView2/WinForms 窗体必须在 STA UI 线程创建。
        void OpenWindowNow()
        {
            try
            {
                if (_uiAnchor != null && _uiAnchor.InvokeRequired)
                {
                    try { _uiAnchor.BeginInvoke(new Action(OpenWindowOnUiThread)); }
                    catch (Exception ex) { Program.Log("切回UI线程失败，尝试直接开窗: " + ex.Message); OpenWindowOnUiThread(); }
                    return;
                }
                OpenWindowOnUiThread();
            }
            catch (Exception ex) { Program.Log("打开窗口失败: " + ex.Message); }
        }

        void OpenWindowOnUiThread()
        {
            try { DshClient.OpenWindow(ClientUrl(), Program.AppName, LoadIcon()); }
            catch (Exception ex) { Program.Log("打开窗口失败: " + ex.Message); }
        }

        // dsh 启动后会打印带 token 的访问地址（http://127.0.0.1:<port>/?token=xxx），
        // 根路径不带 token 会被拒绝，所以必须从 service.log 里解析出真实地址再开窗。
        internal string ClientUrl()
        {
            string baseUrl = "http://127.0.0.1:" + Program.Port;
            string u; int p;
            if (TryParseClientUrl(out u, out p) && !string.IsNullOrEmpty(u)) return u;
            return baseUrl;
        }

        // 开机自启：写 HKCU\Software\Microsoft\Windows\CurrentVersion\Run
        static readonly string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        static bool IsAutostartEnabled()
        {
            try
            {
                using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunKey))
                    return k != null && k.GetValue(Program.AppName) != null;
            }
            catch { return false; }
        }
        void ToggleAutostart()
        {
            try
            {
                using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunKey, true))
                {
                    if (k == null) return;
                    if (IsAutostartEnabled()) k.DeleteValue(Program.AppName, false);
                    else
                    {
                        string exe = Path.Combine(Program.AppDir, "KK Go.exe");
                        k.SetValue(Program.AppName, "\"" + exe + "\" --startup");
                    }
                }
            }
            catch (Exception ex) { Program.Log("自启开关失败: " + ex.Message); }
        }

        // 检查更新：后台拉取 GitHub 最新 release 的 tag_name，与本地版本比对。
        // 不阻塞 UI；断网/超时静默忽略，绝不弹错误框打扰用户。
        void CheckForUpdates()
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(Program.RepoLatestUrl);
                    req.Method = "GET";
                    req.Timeout = 12000;
                    req.ReadWriteTimeout = 12000;
                    req.UserAgent = "KKGo-Updater";
                    req.Accept = "application/vnd.github+json";
                    string json;
                    using (var resp = (System.Net.HttpWebResponse)req.GetResponse())
                    using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                        json = sr.ReadToEnd();
                    var m = Regex.Match(json, "\"tag_name\"\\s*:\\s*\"v?([0-9]+\\.[0-9]+\\.[0-9]+)\"");
                    if (!m.Success) return;
                    string latest = m.Groups[1].Value;
                    Version lv, cv;
                    if (!Version.TryParse(latest, out lv) || !Version.TryParse(Program.AppVersion, out cv)) return;
                    if (lv <= cv)
                    {
                        ShowOnUi(delegate
                        {
                            MessageBox.Show("当前已是最新版本 v" + Program.AppVersion + "。",
                                Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
                        });
                        return;
                    }
                    ShowOnUi(delegate
                    {
                        var r = MessageBox.Show(
                            "发现新版本 v" + latest + "（当前 v" + Program.AppVersion + "）。\r\n\r\n" +
                            "新版本可从 GitHub 下载，安装时直接覆盖即可，数据不会丢失。\r\n\r\n" +
                            "现在打开下载页面吗？",
                            "KK Go 检查更新", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                        if (r == DialogResult.Yes)
                        {
                            try { System.Diagnostics.Process.Start(Program.RepoReleasesUrl); }
                            catch { }
                        }
                    });
                }
                catch (Exception ex) { Program.Log("检查更新失败（已忽略）: " + ex.Message); }
            });
        }

        // 打开数据目录（会话/配置/插件数据所在位置）
        void OpenDataDir()
        {
            try
            {
                string dir = Program.DataDir;
                Directory.CreateDirectory(dir);
                System.Diagnostics.Process.Start("explorer.exe", "\"" + dir + "\"");
            }
            catch (Exception ex) { Program.Log("打开数据目录失败: " + ex.Message); }
        }

        // 查看运行日志
        void OpenLogFile()
        {
            try
            {
                string log = Program.LogPath;
                if (!File.Exists(log)) { File.WriteAllText(log, "(暂无日志)"); }
                System.Diagnostics.Process.Start("notepad.exe", "\"" + log + "\"");
            }
            catch (Exception ex) { Program.Log("打开日志失败: " + ex.Message); }
        }

        // 关于：显示版本、内核、数据目录、端口
        void ShowAbout()
        {
            ShowOnUi(delegate
            {
                MessageBox.Show(
                    Program.AppName + " 桌面版  v" + Program.AppVersion + "\r\n" +
                    "内核 @deepseek-ai/dsh  " + Program.KernelVersion + "\r\n\r\n" +
                    "数据目录：" + Program.DataDir + "\r\n" +
                    "服务端口：" + Program.Port + "\r\n" +
                    "安装目录：" + Program.AppDir + "\r\n\r\n" +
                    "托盘右键可检查更新、打开数据目录、查看日志。",
                    "关于 " + Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            });
        }

        void ExitApp()
        {
            _stopping = true;
            StopService();
            _tray.Visible = false;
            _tray.Dispose();
            ExitThread();
        }

        // 处理重复启动实例发来的「打开窗口」自定义消息
        internal sealed class WindowMessageFilter : IMessageFilter
        {
            readonly TrayApp _app;
            internal WindowMessageFilter(TrayApp app) { _app = app; }
            public bool PreFilterMessage(ref Message m)
            {
                if (m.Msg == NativeMethods.WM_SHOW_APP) { _app.OpenWindow(); return true; }
                return false;
            }
        }
    }

    internal static class NativeMethods
    {
        internal const int WM_SHOW_APP = 0x0400 + 42;
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam,
            uint flags, uint timeout, out IntPtr result);
        // 广播给所有顶层窗口；已有实例的消息过滤器会响应
        internal static void PostNotifyMessage()
        {
            IntPtr res;
            SendMessageTimeout((IntPtr)0xffff, WM_SHOW_APP, IntPtr.Zero, IntPtr.Zero, 2, 1000, out res);
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        internal static extern IntPtr CreateFile(string lpFileName, uint dwDesiredAccess, uint dwShareMode,
            IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

        [DllImport("kernel32.dll")]
        internal static extern IntPtr GetStdHandle(int nStdHandle);
    }
}
