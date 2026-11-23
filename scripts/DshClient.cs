// KK Go 桌面版 —— 原生客户端窗口 (WebView2)
// 编译：见 build.ps1 第 4 步。与 Launcher.cs 一起编译进 "KK Go.exe"。
// 职责：承载 http://127.0.0.1:<port> 的原生窗口，统一鲸鱼图标；
//       WebView2 运行时缺失时回退到 Edge 应用窗口 / 默认浏览器。
using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace DshGo
{
    internal static class DshClient
    {
        // 记住最后一次打开的窗口控件与地址：防火墙放行后需要重新导航一次，
        // 否则用户会一直停在浏览器的"无法访问此网站"错误页上。
        static Control _lastControl;
        static string _lastUrl;

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

        /// <summary>重新导航到当前地址（防火墙放行、端口切换后调用）。</summary>
        internal static void Reload()
        {
            var ctl = _lastControl;
            var url = _lastUrl;
            if (ctl == null || string.IsNullOrEmpty(url)) return;
            try
            {
                Action navigate = () =>
                {
                    try
                    {
                        var srcProp = ctl.GetType().GetProperty("Source");
                        if (srcProp != null && srcProp.PropertyType == typeof(Uri))
                            srcProp.SetValue(ctl, new Uri(url), null);
                    }
                    catch (Exception ex) { Program.Log("WebView2 重新导航失败: " + ex.Message); }
                };
                if (ctl.InvokeRequired) ctl.BeginInvoke(navigate);
                else navigate();
            }
            catch (Exception ex) { Program.Log("WebView2 重新导航异常: " + ex.Message); }
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
            /// <summary>
            /// 构造一个指定了用户数据目录的 CoreWebView2Environment（反射调用，避免编译期绑定 WebView2 版本）。
            /// 失败时返回 null —— 让 WebView2 走默认行为，总比整个窗口起不来强。
            /// </summary>
            static object CreateEnvironment()
            {
                try
                {
                    string dir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        Program.AppName, "WebView2");
                    Directory.CreateDirectory(dir);

                    Type envType = null;
                    foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                    {
                        envType = asm.GetType("Microsoft.Web.WebView2.Core.CoreWebView2Environment");
                        if (envType != null) break;
                    }
                    if (envType == null)
                        envType = Type.GetType(
                            "Microsoft.Web.WebView2.Core.CoreWebView2Environment, Microsoft.Web.WebView2.Core", true);

                    System.Reflection.MethodInfo create = null;
                    foreach (var m in envType.GetMethods())
                    {
                        if (m.Name == "CreateAsync" && m.GetParameters().Length == 3) { create = m; break; }
                    }
                    if (create == null) throw new InvalidOperationException("CoreWebView2Environment.CreateAsync 重载缺失");

                    var created = (System.Threading.Tasks.Task)create.Invoke(null, new object[] { null, dir, null });
                    created.GetAwaiter().GetResult();
                    object result = created.GetType().GetProperty("Result").GetValue(created, null);
                    Program.Log("WebView2 用户数据目录: " + dir);
                    return result;
                }
                catch (Exception ex)
                {
                    Program.Log("创建 WebView2 环境失败，改用默认用户数据目录: " + ex.Message);
                    return null;
                }
            }

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
                _lastControl = ctl;
                _lastUrl = url;

                // 异步初始化并导航（EnsureCoreWebView2Async）
                //
                // ⚠ EnsureCoreWebView2Async 有两个重载：
                //   Task EnsureCoreWebView2Async(CoreWebView2Environment)
                //   Task EnsureCoreWebView2Async(CoreWebView2Environment, CoreWebView2ControllerOptions)
                // 用 GetMethod("EnsureCoreWebView2Async") 单参查找会抛
                // AmbiguousMatchException（"发现不明确的匹配"）—— 曾导致原生窗口永远
                // 起不来、只能回退到外部浏览器。这里按参数个数精确挑选单参重载。
                System.Reflection.MethodInfo ensure = null;
                foreach (var m in type.GetMethods())
                {
                    if (m.Name == "EnsureCoreWebView2Async" && m.GetParameters().Length == 1)
                    {
                        ensure = m;
                        break;
                    }
                }
                if (ensure == null)
                    throw new InvalidOperationException("WebView2 缺少 EnsureCoreWebView2Async(environment) 重载");

                // 用户数据目录必须显式指定。
                // 不指定时 WebView2 默认写在【可执行文件同级目录】下
                // （<安装目录>\KK Go.exe.WebView2），后果有三：
                //   1) 卸载后残留一整个浏览器缓存目录；
                //   2) 安装到 Program Files 时没有写权限，WebView2 直接起不来；
                //   3) 和程序文件混在一起，升级时被当成程序文件一起搬走。
                // 统一放到 %LOCALAPPDATA%\KK Go\WebView2（每个用户一份，卸载时一并清理）。
                object env = CreateEnvironment();
                var task = (System.Threading.Tasks.Task)ensure.Invoke(ctl, env == null ? new object[] { null } : new object[] { env });
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
