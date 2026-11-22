// DeepSeek Harness 桌面版 —— 托盘启动器 + 服务监护 + 崩溃自愈
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
using System.Threading;
using System.Windows.Forms;

namespace DeepSeekHarness
{
    internal static class Program
    {
        internal const string AppName = "DeepSeek Harness";
        internal const string MutexName = @"Local\DeepSeekHarness-SingleInstance-18632";
        // 注意：build.ps1 用 .NET Framework 4.0 自带的 csc.exe（C# 5），
        // 不支持 C# 6 表达式体属性（=>），故一律写成传统 get 访问器。
        internal static string AppDir { get { return AppDomain.CurrentDomain.BaseDirectory; } }
        internal static string DataDir
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".dsh");
            }
        }
        internal static string LogPath { get { return Path.Combine(DataDir, "desktop.log"); } }
        internal static string PidPath { get { return Path.Combine(DataDir, "desktop.pid"); } }
        internal static int Port { get { return ParsePort(Environment.GetEnvironmentVariable("DSH_PORT")); } }
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
        Process _service;
        bool _stopping;
        int _restartFailures;
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
            var autostart = new ToolStripMenuItem("开机自启", null, (s, e) => ToggleAutostart());
            autostart.Checked = IsAutostartEnabled();
            menu.Items.Add(autostart);
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
                    bool ok = ar.AsyncWaitHandle.WaitOne(300);
                    if (ok) c.EndConnect(ar);
                    return ok;
                }
            }
            catch { return false; }
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
                var psi = new ProcessStartInfo(node)
                {
                    WorkingDirectory = Program.AppDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    Arguments = "\"" + bin + "\" --profile web --port " + Program.Port
                };
                psi.EnvironmentVariables["NODE_PATH"] = Path.Combine(Program.AppDir, "dsh", "node_modules");
                _service = new Process { StartInfo = psi, EnableRaisingEvents = true };
                _service.Exited += Service_Exited;
                _service.Start();
                File.WriteAllText(Program.PidPath, _service.Id.ToString());
                Program.Log("服务已启动 pid=" + _service.Id);
                // 异步泵日志，避免缓冲区满导致子进程阻塞
                BeginPump(_service.StandardOutput);
                BeginPump(_service.StandardError);
            }
            catch (Exception ex) { Program.Log("启动服务失败: " + ex.Message); }
        }

        void BeginPump(StreamReader r)
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    string line;
                    while ((line = r.ReadLine()) != null) Program.Log("[dsh] " + line);
                }
                catch { }
            });
        }

        // 崩溃自愈核心：服务意外退出 → 延迟自动重启；连续失败则提示用户
        void Service_Exited(object sender, EventArgs e)
        {
            if (_stopping) return;
            int code = -1;
            try { code = ((Process)sender).ExitCode; } catch { }
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

        void StopService()
        {
            _stopping = true;
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
                    if (IsPortOpen())
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

        void OpenWindow()
        {
            // WebView2/WinForms 窗体必须在 STA UI 线程创建。若当前是 ThreadPool(MTA)
            // 线程，则经锚点控件切回主线程执行；否则直接开窗。
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
            try { DshClient.OpenWindow("http://127.0.0.1:" + Program.Port, Program.AppName, LoadIcon()); }
            catch (Exception ex) { Program.Log("打开窗口失败: " + ex.Message); }
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
                        string exe = Path.Combine(Program.AppDir, "DeepSeek Harness.exe");
                        k.SetValue(Program.AppName, "\"" + exe + "\" --startup");
                    }
                }
            }
            catch (Exception ex) { Program.Log("自启开关失败: " + ex.Message); }
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
    }
}
