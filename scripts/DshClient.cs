// DeepSeek Harness 桌面版 — 原生客户端窗口（WebView2 承载本地页面）
// 任务栏/窗口图标使用黑色鲸鱼; WebView2 运行时缺失时回退到 Edge 应用窗口/默认浏览器
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class DshClient
{
    private static Form _form;
    private static WebView2 _web;
    private static System.Windows.Forms.Timer _retry;

    /// <summary>打开（或激活已有）客户端窗口。</summary>
    public static void Open(string url, string iconPath, string title, string userDataDir)
    {
        if (_form != null && !_form.IsDisposed)
        {
            if (_form.WindowState == FormWindowState.Minimized)
                _form.WindowState = FormWindowState.Normal;
            _form.Activate();
            return;
        }

        _form = new Form();
        _form.Text = title;
        try { _form.Icon = new Icon(iconPath); } catch { /* 图标缺失不阻塞 */ }
        _form.StartPosition = FormStartPosition.CenterScreen;
        _form.Size = new Size(1280, 820);
        _form.MinimumSize = new Size(800, 600);
        _form.ShowInTaskbar = true;
        _form.StartPosition = FormStartPosition.CenterScreen;

        _web = new WebView2();
        _web.Dock = DockStyle.Fill;
        _form.Controls.Add(_web);

        _form.FormClosed += delegate
        {
            try { if (_retry != null) { _retry.Stop(); _retry.Dispose(); _retry = null; } } catch { }
            try { if (_web != null) { _web.Dispose(); _web = null; } } catch { }
            _form = null;
        };

        _form.Load += delegate
        {
            // 先同步探测 WebView2 运行时，缺失则回退浏览器
            try
            {
                string v = CoreWebView2Environment.GetAvailableBrowserVersionString();
                if (string.IsNullOrEmpty(v))
                    throw new InvalidOperationException("WebView2 runtime missing");
            }
            catch
            {
                Form f = _form;
                _form = null;
                try { f.Dispose(); } catch { }
                DshLauncher.OpenFallbackBrowser(url);
                return;
            }
            try { Directory.CreateDirectory(userDataDir); } catch { }
            InitAsync(url, userDataDir);
        };

        _form.Show();
    }

    private static async void InitAsync(string url, string userDataDir)
    {
        try
        {
            CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, userDataDir);
            await _web.EnsureCoreWebView2Async(env);

            _web.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _web.CoreWebView2.Settings.IsStatusBarEnabled = false;

            _web.CoreWebView2.DocumentTitleChanged += delegate
            {
                try
                {
                    if (_form != null && _web != null)
                        _form.Text = _web.CoreWebView2.DocumentTitle;
                }
                catch { }
            };

            // 外部链接（新窗口请求）交给默认浏览器
            _web.CoreWebView2.NewWindowRequested += delegate(object s, CoreWebView2NewWindowRequestedEventArgs e)
            {
                e.Handled = true;
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo(e.Uri);
                    psi.UseShellExecute = true;
                    Process.Start(psi);
                }
                catch { }
            };

            _web.Source = new Uri(url);
            StartRetry();
        }
        catch
        {
            // 初始化失败 → 回退浏览器
            Form f = _form;
            _form = null;
            try { if (f != null) f.Dispose(); } catch { }
            DshLauncher.OpenFallbackBrowser(url);
        }
    }

    /// <summary>服务未就绪时每 2 秒重载，就绪后自动停表。</summary>
    private static void StartRetry()
    {
        _retry = new System.Windows.Forms.Timer();
        _retry.Interval = 2000;
        _retry.Tick += delegate
        {
            try
            {
                if (DshLauncher.IsServerUp())
                    _retry.Stop();
                else if (_web != null)
                    _web.Reload();
            }
            catch { }
        };
        _retry.Start();
    }
}
