// DeepSeek Harness 桌面版启动器（托盘常驻版）
// 模式:
//   无参数      = 启动服务 + 打开客户端窗口 + 托盘常驻
//   --startup   = 开机自启: 启动服务 + 托盘常驻（不弹窗口）
//   stop        = 停止服务并退出（兼容开始菜单"停止"快捷方式）
//   二次启动    = 通知已运行的托盘实例打开窗口（或请求退出）
// 编译: csc /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001
//       /win32icon:whale.ico /out:"DeepSeek Harness.exe"
//       /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll Launcher.cs
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Win32;

static class DshLauncher
{
    private const string APP_MUTEX = "DeepSeekHarnessLauncher";
    private const string OPEN_EVENT = "DSH_OpenEvent";
    private const string EXIT_EVENT = "DSH_ExitEvent";
    private const string AUTOSTART_RUN_KEY = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AUTOSTART_VALUE = "DeepSeekHarness";
    private const long MAX_LOG_BYTES = 1024 * 1024; // 日志超 1MB 轮转
    // 桌面客户端专用端口: 避开 dsh CLI/harness 默认的 3080，防止同机多实例冲突
    private const int DEFAULT_PORT = 18632;

    private static Process _server;
    private static NotifyIcon _tray;
    private static ContextMenuStrip _menu;
    private static ToolStripMenuItem _miOpen;
    private static ToolStripMenuItem _miRestart;
    private static ToolStripMenuItem _miStop;
    private static ToolStripMenuItem _miAutoStart;
    private static EventWaitHandle _openEvt;
    private static EventWaitHandle _exitEvt;
    private static System.Windows.Forms.Timer _ticker;
    private static bool _serverOwned;
    private static bool _restarting;
    private static bool _pendingOpen;

    // PerMonitorV2 高 DPI 上下文（Win10 1703+），修复缩放下字体模糊
    private static readonly IntPtr DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = new IntPtr(-4);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    private static string AppDir
    {
        get { return AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar); }
    }

    private static string ExePath
    {
        get { return Application.ExecutablePath; }
    }

    private static string WhaleIcon
    {
        get { return Path.Combine(AppDir, "whale.ico"); }
    }

    private static string NodeExe
    {
        get { return Path.Combine(AppDir, "runtime", "node.exe"); }
    }

    private static string DshRoot
    {
        get { return Path.Combine(AppDir, "dsh"); }
    }

    private static string BinJs
    {
        get { return Path.Combine(DshRoot, "lib", "bin.js"); }
    }

    private static string ProfileTpl
    {
        get { return Path.Combine(AppDir, "profiles", "web"); }
    }

    private static string HomeDir
    {
        get
        {
            string h = Environment.GetEnvironmentVariable("DSH_HOME");
            if (!string.IsNullOrWhiteSpace(h))
            {
                try { return Path.GetFullPath(h); }
                catch { /* fall through */ }
            }
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".dsh");
        }
    }

    private static string PidFile
    {
        get { return Path.Combine(HomeDir, "desktop.pid"); }
    }

    private static string LogFile
    {
        get { return Path.Combine(HomeDir, "desktop.log"); }
    }

    private static int Port
    {
        get
        {
            string p = Environment.GetEnvironmentVariable("DSH_PORT");
            int n;
            if (!string.IsNullOrWhiteSpace(p) && int.TryParse(p, out n) && n > 0 && n < 65536) return n;
            return DEFAULT_PORT;
        }
    }

    private static string ServerUrl
    {
        get { return "http://127.0.0.1:" + Port + "/"; }
    }

    private static bool NoOpen
    {
        get { return Environment.GetEnvironmentVariable("DSH_NO_OPEN") == "1"; }
    }

    [STAThread]
    private static int Main(string[] args)
    {
        // 高 DPI 感知（PerMonitorV2）: 修复系统缩放 125%/150% 时界面字体模糊
        // （清单已声明 PerMonitorV2，这里 P/Invoke 兜底；必须在任何窗口创建前调用）
        try { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2); } catch { }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            bool wantStop = Array.IndexOf(args, "stop") >= 0;
            bool startupMode = Array.IndexOf(args, "--startup") >= 0;

            bool createdNew = false;
            Mutex m = null;
            try
            {
                m = new Mutex(true, APP_MUTEX, out createdNew);
            }
            catch (AbandonedMutexException)
            {
                // 上次实例异常退出: 接管
                createdNew = false;
            }

            if (!createdNew)
            {
                // 已有托盘实例在运行
                if (wantStop) SignalNamedEvent(EXIT_EVENT);
                else SignalNamedEvent(OPEN_EVENT);
                if (m != null) m.Dispose();
                return 0;
            }

            using (m)
            {
                if (wantStop)
                {
                    // 直接停止（托盘实例可能不存在）
                    StopServer();
                    SignalNamedEvent(EXIT_EVENT);
                    return 0;
                }

                using (_openEvt = new EventWaitHandle(false, EventResetMode.AutoReset, OPEN_EVENT))
                using (_exitEvt = new EventWaitHandle(false, EventResetMode.AutoReset, EXIT_EVENT))
                {
                    try { Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal; }
                    catch { /* 非关键 */ }

                    EnsureProfile();

                    if (!IsServerUp())
                    {
                        StartServer();
                        WaitReady(150000);
                    }

                    // 窗口必须在消息循环启动后再打开（WebView2 初始化依赖 UI 线程消息泵），
                    // 交给托盘定时器的首个 tick 处理
                    _pendingOpen = !startupMode;

                    RunTray(startupMode);
                }
            }
            return 0;
        }
        catch (Exception ex)
        {
            MessageBox.Show("DeepSeek Harness 启动失败：\n" + ex.Message, "DeepSeek Harness",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    // ---------------- 托盘 ----------------

    private static void RunTray(bool startupMode)
    {
        _menu = new ContextMenuStrip();
        _miOpen = new ToolStripMenuItem("打开 DeepSeek Harness", null, delegate { OpenWindow(); });
        _miRestart = new ToolStripMenuItem("重启服务", null, delegate { RequestRestart(); });
        _miStop = new ToolStripMenuItem("停止服务（释放内存）", null, delegate { RequestStopService(); });
        _miAutoStart = new ToolStripMenuItem("开机自启", null, delegate { ToggleAutoStart(); });
        _miAutoStart.CheckOnClick = true;
        _miAutoStart.Checked = IsAutoStart();
        ToolStripMenuItem miExit = new ToolStripMenuItem("退出（停止服务并退出）", null, delegate { ExitApp(); });
        _menu.Items.Add(_miOpen);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add(_miRestart);
        _menu.Items.Add(_miStop);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add(_miAutoStart);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add(miExit);

        _tray = new NotifyIcon();
        _tray.Icon = LoadTrayIcon();
        _tray.Text = "DeepSeek Harness";
        _tray.ContextMenuStrip = _menu;
        _tray.Visible = true;
        _tray.DoubleClick += delegate { OpenWindow(); };

        RefreshMenuState();

        if (IsServerUp())
            _tray.ShowBalloonTip(3000, "DeepSeek Harness", "服务已就绪，点击图标打开客户端。", ToolTipIcon.Info);
        else
            _tray.ShowBalloonTip(3000, "DeepSeek Harness", "正在启动服务…（首次启动需要一些时间）", ToolTipIcon.Info);

        _ticker = new System.Windows.Forms.Timer();
        _ticker.Interval = 1000;
        _ticker.Tick += delegate { Tick(); };
        _ticker.Start();

        Application.Run();

        _ticker.Stop();
        _tray.Visible = false;
        _tray.Dispose();
        _menu.Dispose();
    }

    private static Icon LoadTrayIcon()
    {
        try { return new Icon(WhaleIcon); }
        catch { return SystemIcons.Application; }
    }

    private static void Tick()
    {
        try
        {
            if (_openEvt != null && _openEvt.WaitOne(0)) OpenWindow();
            if (_exitEvt != null && _exitEvt.WaitOne(0))
            {
                StopServer();
                Application.Exit();
                return;
            }

            if (_pendingOpen)
            {
                _pendingOpen = false;
                OpenWindow();
            }

            if (_restarting)
            {
                if (IsServerUp())
                {
                    _restarting = false;
                    RefreshMenuState();
                    _tray.ShowBalloonTip(2000, "DeepSeek Harness", "服务已重启。", ToolTipIcon.Info);
                }
                return;
            }

            if (_server != null && _server.HasExited)
            {
                _server = null;
                _serverOwned = false;
                RefreshMenuState();
                _tray.ShowBalloonTip(3000, "DeepSeek Harness", "服务异常退出。可在托盘菜单中点击“重启服务”。", ToolTipIcon.Warning);
            }
        }
        catch { /* 忽略瞬时错误 */ }
    }

    private static void RefreshMenuState()
    {
        bool up = IsServerUp();
        _miOpen.Enabled = true;
        _miStop.Enabled = up;
        _miRestart.Enabled = true;
        if (_tray != null)
            _tray.Text = up ? "DeepSeek Harness — 服务运行中" : "DeepSeek Harness — 服务已停止";
    }

    private static void RequestRestart()
    {
        StopServer();
        _restarting = true;
        RefreshMenuState();
        StartServer();
    }

    private static void RequestStopService()
    {
        StopServer();
        RefreshMenuState();
        _tray.ShowBalloonTip(2000, "DeepSeek Harness", "服务已停止，内存已释放。再次打开客户端会自动重启。", ToolTipIcon.Info);
    }

    private static void ExitApp()
    {
        StopServer();
        Application.Exit();
    }

    private static void ToggleAutoStart()
    {
        bool on = !IsAutoStart();
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(AUTOSTART_RUN_KEY, true))
            {
                if (k == null) return;
                if (on) k.SetValue(AUTOSTART_VALUE, "\"" + ExePath + "\" --startup");
                else k.DeleteValue(AUTOSTART_VALUE, false);
            }
            _miAutoStart.Checked = on;
            _tray.ShowBalloonTip(2000, "DeepSeek Harness", on ? "已开启开机自启（登录后自动在后台启动服务）。" : "已关闭开机自启。", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            MessageBox.Show("设置开机自启失败：\n" + ex.Message, "DeepSeek Harness", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static bool IsAutoStart()
    {
        try
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(AUTOSTART_RUN_KEY, false))
            {
                if (k == null) return false;
                object v = k.GetValue(AUTOSTART_VALUE);
                return v != null && v.ToString().IndexOf("--startup", StringComparison.OrdinalIgnoreCase) >= 0;
            }
        }
        catch { return false; }
    }

    private static void SignalNamedEvent(string name)
    {
        try
        {
            using (EventWaitHandle h = new EventWaitHandle(false, EventResetMode.AutoReset, name))
            {
                h.Set();
            }
        }
        catch { /* 主实例可能正在退出 */ }
    }

    // ---------------- 服务管理 ----------------

    private static void EnsureProfile()
    {
        string webProfile = Path.Combine(HomeDir, "profiles", "web");
        string marker = Path.Combine(webProfile, "package.json");
        if (File.Exists(marker))
        {
            // 升级场景: 老用户 profile 已存在, 确保 Plugin Suite bundle 在列,
            // 否则 2.95.27 的 15 个插件不会被加载。
            try
            {
                string raw = File.ReadAllText(marker);
                if (!raw.Contains("@deepseek-ai/dsh-plugin-suite"))
                {
                    var ser = new JavaScriptSerializer();
                    var manifest = ser.Deserialize<Dictionary<string, object>>(raw);
                    object dshObj, profObj, bObj;
                    if (manifest != null && manifest.TryGetValue("dsh", out dshObj))
                    {
                        var dsh = dshObj as Dictionary<string, object>;
                        if (dsh != null && dsh.TryGetValue("profile", out profObj))
                        {
                            var prof = profObj as Dictionary<string, object>;
                            if (prof != null && prof.TryGetValue("bundles", out bObj))
                            {
                                var bundles = bObj as ArrayList;
                                if (bundles != null && !bundles.Contains("@deepseek-ai/dsh-plugin-suite"))
                                {
                                    bundles.Add("@deepseek-ai/dsh-plugin-suite");
                                    string updated = ser.Serialize(manifest);
                                    File.WriteAllText(marker, updated + "\n");
                                    AppendLog("已为升级安装启用 Plugin Suite (2.95.27)");
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                AppendLog("升级 profile 更新失败(不影响启动): " + ex.Message);
            }
            return;
        }
        if (!Directory.Exists(ProfileTpl))
            return; // dsh 会自动初始化
        try
        {
            Directory.CreateDirectory(webProfile);
            foreach (string f in Directory.GetFiles(ProfileTpl))
            {
                string name = Path.GetFileName(f);
                if (name == "package.json" || name == "cordis.yml" || name == "cordis.patch.yml" || name == "pnpm-workspace.yaml")
                    File.Copy(f, Path.Combine(webProfile, name), true);
            }
        }
        catch { /* dsh 自动初始化兜底 */ }
    }

    private static void StartServer()
    {
        Directory.CreateDirectory(HomeDir);
        AppendLog("=== DeepSeek Harness 启动 ===");

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = NodeExe;
        psi.Arguments = "\"" + BinJs + "\" --profile web --port " + Port;
        psi.WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;
        psi.EnvironmentVariables["DSH_HOME"] = HomeDir;

        _server = Process.Start(psi);
        _serverOwned = true;
        // 重要: 托盘进程是 BelowNormal 优先级，子进程默认继承;
        // 服务必须恢复为 Normal，否则智能体文件/命令操作会变慢
        try { _server.PriorityClass = ProcessPriorityClass.Normal; } catch { }
        try { File.WriteAllText(PidFile, _server.Id.ToString()); } catch { }

        _server.OutputDataReceived += delegate(object s, DataReceivedEventArgs e)
        {
            if (e.Data != null) AppendLog(e.Data);
        };
        _server.ErrorDataReceived += delegate(object s, DataReceivedEventArgs e)
        {
            if (e.Data != null) AppendLog(e.Data);
        };
        _server.BeginOutputReadLine();
        _server.BeginErrorReadLine();
    }

    private static void StopServer()
    {
        int pid = -1;
        if (_server != null && !_server.HasExited) pid = _server.Id;
        else
        {
            string s = ReadPid();
            if (s != null && int.TryParse(s, out pid)) { /* pid from file */ }
            else pid = -1;
        }

        if (pid > 0)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("taskkill", "/PID " + pid + " /T /F");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                Process p = Process.Start(psi);
                if (p != null) p.WaitForExit(8000);
            }
            catch { }
        }

        try { if (_server != null) _server.Dispose(); } catch { }
        _server = null;
        _serverOwned = false;
        _restarting = false;
        try { File.Delete(PidFile); } catch { }
        AppendLog("=== 服务已停止 ===");
    }

    private static bool WaitReady(int timeoutMs)
    {
        DateTime deadline = DateTime.UtcNow.AddSeconds(timeoutMs / 1000.0);
        while (DateTime.UtcNow < deadline)
        {
            if (IsServerUp()) return true;
            if (_server != null && _server.HasExited) break;
            Thread.Sleep(500);
        }
        return IsServerUp();
    }

    public static bool IsServerUp()
    {
        try
        {
            using (TcpClient c = new TcpClient())
            {
                IAsyncResult r = c.BeginConnect("127.0.0.1", Port, null, null);
                if (!r.AsyncWaitHandle.WaitOne(700, false))
                    return false;
                c.EndConnect(r);
                return true;
            }
        }
        catch { return false; }
    }

    // ---------------- 窗口/浏览器 ----------------

    /// <summary>打开客户端：优先原生 WebView2 窗口（鲸鱼图标），缺失时回退浏览器。</summary>
    private static void OpenWindow()
    {
        if (NoOpen)
            return;
        // 服务未就绪时先拉起（窗口内会自动重试加载）
        if (!IsServerUp())
        {
            if (_server == null || _server.HasExited) StartServer();
        }
        string dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DeepSeekHarness", "WebView2");
        DshClient.Open(ServerUrl, WhaleIcon, "DeepSeek Harness", dataDir);
    }

    /// <summary>WebView2 不可用时的回退：等待服务就绪后以 Edge/Chrome 应用窗口打开。</summary>
    public static void OpenFallbackBrowser(string url)
    {
        if (!IsServerUp())
        {
            Thread t = new Thread(delegate()
            {
                DateTime deadline = DateTime.UtcNow.AddSeconds(150);
                while (DateTime.UtcNow < deadline)
                {
                    if (IsServerUp()) break;
                    Thread.Sleep(1000);
                }
                LaunchBrowser(url);
            });
            t.IsBackground = true;
            t.Start();
            return;
        }
        LaunchBrowser(url);
    }

    private static void LaunchBrowser(string url)
    {
        string edge = FindBrowser("msedge.exe");
        if (edge != null)
        {
            // 优先通过带鲸鱼图标的快捷方式启动 Edge 应用窗口（任务栏同样显示鲸鱼）
            string lnk = Path.Combine(Path.GetTempPath(), "DeepSeekHarness.lnk");
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    object shell = Activator.CreateInstance(shellType);
                    object shortcut = shellType.InvokeMember("CreateShortcut",
                        System.Reflection.BindingFlags.InvokeMethod, null, shell,
                        new object[] { lnk });
                    if (shortcut != null)
                    {
                        Type st = shortcut.GetType();
                        st.InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty,
                            null, shortcut, new object[] { edge });
                        st.InvokeMember("Arguments", System.Reflection.BindingFlags.SetProperty,
                            null, shortcut, new object[] { "--app=" + url + " --new-window" });
                        st.InvokeMember("IconLocation", System.Reflection.BindingFlags.SetProperty,
                            null, shortcut, new object[] { WhaleIcon + ",0" });
                        st.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod,
                            null, shortcut, null);
                        ProcessStartInfo psi = new ProcessStartInfo(lnk);
                        psi.UseShellExecute = true;
                        Process.Start(psi);
                        return;
                    }
                }
            }
            catch { }
            try { Process.Start(edge, "--app=" + url + " --new-window"); return; }
            catch { }
        }
        string chrome = FindBrowser("chrome.exe");
        if (chrome != null)
        {
            try { Process.Start(chrome, "--app=" + url + " --new-window"); return; }
            catch { }
        }
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(url);
            psi.UseShellExecute = true;
            Process.Start(psi);
        }
        catch { }
    }

    private static string FindBrowser(string exeName)
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string[] roots = new string[] { pf86, pf, Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) };
        foreach (string root in roots)
        {
            if (string.IsNullOrEmpty(root)) continue;
            string[] candidates = new string[]
            {
                Path.Combine(root, "Microsoft", "Edge", "Application", exeName),
                Path.Combine(root, "Google", "Chrome", "Application", exeName)
            };
            foreach (string c in candidates)
                if (File.Exists(c)) return c;
        }
        return null;
    }

    // ---------------- 日志/PID ----------------

    private static void AppendLog(string line)
    {
        try
        {
            if (File.Exists(LogFile) && new FileInfo(LogFile).Length > MAX_LOG_BYTES)
            {
                try { File.Copy(LogFile, LogFile + ".old", true); } catch { }
                try { File.Delete(LogFile); } catch { }
            }
            File.AppendAllText(LogFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + line + Environment.NewLine);
        }
        catch { }
    }

    private static string ReadPid()
    {
        try
        {
            if (!File.Exists(PidFile)) return null;
            string s = File.ReadAllText(PidFile).Trim();
            return s.Length == 0 ? null : s;
        }
        catch { return null; }
    }
}
