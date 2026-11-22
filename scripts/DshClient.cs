// DeepSeek Harness 桌面版 —— 原生客户端窗口 (WebView2)
// 编译：见 build.ps1 第 4 步。与 Launcher.cs 一起编译进 "DeepSeek Harness.exe"。
// 职责：承载 http://127.0.0.1:<port> 的原生窗口，统一鲸鱼图标；
//       WebView2 运行时缺失时回退到 Edge 应用窗口 / 默认浏览器。
using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace DeepSeekHarness
{
    internal static class DshClient
    {
        // 由 Launcher 传入 URL / 标题 / 图标，避免跨文件静态耦合。
        internal static void OpenWindow(string url, string title, Icon icon)
        {
            // 如果已经有一个窗口开着，直接激活它，不重复开
            var existing = Application.OpenForms["DshWindow"];
            if (existing != null)
            {
                try { existing.Activate(); } catch { }
                return;
            }

            try
            {
                if (WebView2Available())
                {
                    var f = new WebView2Form(url, title, icon);
                    f.Show();
                    return;
                }
            }
            catch (Exception ex)
            {
                Program.Log("WebView2 初始化失败，回退浏览器: " + ex.Message);
            }
            FallbackToBrowser(url);
        }

        // 检测 WebView2 运行时是否已安装（注册表 CauseVersion）。
        static bool WebView2Available()
        {
            try
            {
                using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                    @"Software\Microsoft\EdgeWebView\Application"))
                {
                    if (k != null && k.GetSubKeyNames().Length > 0) return true;
                }
                using (var k = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                    @"SOFTWARE\Microsoft\EdgeWebView\Application"))
                {
                    if (k != null && k.GetSubKeyNames().Length > 0) return true;
                }
                // 随包分发的 WebView2Loader.dll 在，也可尝试；真正失败会被上层 catch 回退
                return File.Exists(Path.Combine(Program.AppDir, "WebView2Loader.dll"));
            }
            catch { return false; }
        }

        static void FallbackToBrowser(string url)
        {
            try
            {
                // 优先 Edge 应用窗口（无浏览器标签栏），没有则用默认浏览器
                string edge = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    "Microsoft", "Edge", "Application", "msedge.exe");
                if (File.Exists(edge))
                {
                    System.Diagnostics.Process.Start(edge, "--app=\"" + url + "\"");
                    return;
                }
            }
            catch { }
            try { System.Diagnostics.Process.Start(url); }
            catch (Exception ex) { Program.Log("打开浏览器失败: " + ex.Message); }
        }

        sealed class WebView2Form : Form
        {
            internal WebView2Form(string url, string title, Icon icon)
            {
                Name = "DshWindow";
                Text = title;
                Icon = icon;
                StartPosition = FormStartPosition.CenterScreen;
                Width = 1280;
                Height = 800;
                MinimumSize = new Size(900, 600);

                // 通过反射使用 WebView2 WinForms 控件，避免编译期强引用版本差异。
                // 从已加载程序集按名字找类型（build.ps1 已把该 DLL 作为 /r 引用）。
                Type type = null;
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    type = asm.GetType("Microsoft.Web.WebView2.WinForms.WebView2");
                    if (type != null) break;
                }
                // 若尚未加载，按名字触发加载
                if (type == null)
                    type = Type.GetType("Microsoft.Web.WebView2.WinForms.WebView2, Microsoft.Web.WebView2.WinForms", true);
                var ctl = (Control)Activator.CreateInstance(type);
                ctl.Dock = DockStyle.Fill;
                Controls.Add(ctl);

                // 异步初始化并导航（EnsureCoreWebView2Async）
                var ensure = type.GetMethod("EnsureCoreWebView2Async");
                var task = (System.Threading.Tasks.Task)ensure.Invoke(ctl, new object[] { null });
                // await 之后必须回到 UI 线程再设置控件属性；Task.Run 是线程池(MTA)
                // 线程，直接 SetValue 会抛跨线程异常并被吞掉，导致窗口打开但页面空白。
                System.Threading.Tasks.Task.Run(async () =>
                {
                    try
                    {
                        await task;
                        // 用控件所属的 UI 线程同步上下文执行设置
                        Action navigate = () =>
                        {
                            try
                            {
                                var srcProp = type.GetProperty("Source");
                                if (srcProp != null && srcProp.PropertyType == typeof(Uri))
                                    srcProp.SetValue(ctl, new Uri(url), null);
                            }
                            catch (Exception ex) { Program.Log("WebView2 设置 Source 失败: " + ex.Message); }
                        };
                        if (ctl.InvokeRequired) ctl.BeginInvoke(navigate);
                        else navigate();
                    }
                    catch (Exception ex) { Program.Log("WebView2 导航失败: " + ex.Message); }
                });
            }
        }
    }
}
