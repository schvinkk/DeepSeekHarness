// KK Go 桌面版 —— 原生进程启动器 (Win32 CreateProcess)
//
// 为什么不用 ProcessStartInfo：
//   .NET Framework 的 ProcessStartInfo.EnvironmentVariables 内部是 StringDictionary，
//   键比较大小写不敏感；而 Windows 环境块里同时存在 Path / PATH / path 三个变体是常态
//   （Node、WSL、各种安装器都会注入）。字典化时遇到重复键直接抛
//   ArgumentException("已添加项。字典中的关键字:Path 所添加的关键字:PATH")，
//   表现是启动器进程能起来、但子进程永远起不来 —— 用户侧就是"装了却打不开"。
//
//   本类用 Win32 CreateProcess 手工构造环境块，只注入运行 dsh 真正需要的变量，
//   并对重复键做去重（同名取最后一个，与 Windows 自身行为一致），彻底绕开该问题。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace DshGo
{
    internal static class NativeLauncher
    {
        const int CREATE_NO_WINDOW = 0x08000000;
        const int CREATE_NEW_PROCESS_GROUP = 0x00000200;
        const uint STARTF_USESTDHANDLES = 0x00000100;
        const uint STARTF_USESHOWWINDOW = 0x00000001;
        const ushort SW_HIDE = 0;

        /// <summary>
        /// 不能传给 dsh 子进程的环境变量。
        ///
        /// NODE_OPTIONS 里的 --require 会给 node 注入宿主钩子；宿主钩子改写 fs/fs.promises
        /// 后，DSH 的 atomic-write 清锁、pnpm 删临时目录都会失败。本机实测 WorkBuddy 沙箱的
        /// node-safe-delete-shim 正是这样把 DSH 启动打断的（详见 Start() 里的注释）。
        ///
        /// NODE_REPL_EXTERNAL_MODULE 同样会改写 node 的模块加载行为，DSH 不需要它。
        /// ELECTRON_RUN_AS_NODE / NODE_ICU_DATA 等是 Electron 宿主的内部约定，一并清掉，
        /// 免得子进程误以为自己跑在 Electron 里。
        /// </summary>
        static readonly string[] PoisonedEnvVars =
        {
            "NODE_OPTIONS",
            "NODE_REPL_EXTERNAL_MODULE",
            "ELECTRON_RUN_AS_NODE",
            "NODE_ICU_DATA",
        };

        [StructLayout(LayoutKind.Sequential)]
        struct SECURITY_ATTRIBUTES
        {
            public int nLength;
            public IntPtr lpSecurityDescriptor;
            public bool bInheritHandle;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct STARTUPINFO
        {
            public int cb;
            public IntPtr lpReserved;
            public IntPtr lpDesktop;
            public IntPtr lpTitle;
            public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
            public ushort wShowWindow;
            public ushort cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput, hStdOutput, hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct PROCESS_INFORMATION
        {
            public IntPtr hProcess, hThread;
            public int dwProcessId, dwThreadId;
        }

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool CreateProcessW(
            string lpApplicationName, System.Text.StringBuilder lpCommandLine, IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags,
            IntPtr lpEnvironment, string lpCurrentDirectory, ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern uint WaitForSingleObject(IntPtr hObject, uint dwMilliseconds);

        // CreateFile 的可继承版本：显式传 SECURITY_ATTRIBUTES{ bInheritHandle = TRUE }
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern IntPtr CreateFile(
            string lpFileName, uint dwDesiredAccess, uint dwShareMode,
            ref SECURITY_ATTRIBUTES lpSecurityAttributes, uint dwCreationDisposition,
            uint dwFlagsAndAttributes, IntPtr hTemplateFile);

        /// <summary>
        /// 创建一个"可继承"的文件句柄，保证能真正被 CreateProcess 传给子进程。
        /// </summary>
        static IntPtr CreateInheritableFile(string path, uint access, uint share, uint creation, uint flags)
        {
            var sa = new SECURITY_ATTRIBUTES();
            sa.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
            sa.lpSecurityDescriptor = IntPtr.Zero;
            sa.bInheritHandle = true;
            return CreateFile(path, access, share, ref sa, creation, flags, IntPtr.Zero);
        }

        /// <summary>
        /// 由 CreateProcess 直接持有的服务进程句柄。
        /// 不复用 System.Diagnostics.Process：它的 Handle 属性只读，无法注入原生句柄，
        /// 且其 Exited 事件机制依赖 .NET 的进程管理路径；这里全部自己实现，最可控。
        /// </summary>
        internal sealed class ServiceProcess : IDisposable
        {
            internal IntPtr Handle;
            internal int ProcessId;

            internal bool HasExited
            {
                get
                {
                    if (Handle == IntPtr.Zero) return true;
                    uint code;
                    if (!GetExitCodeProcess(Handle, out code)) return true;
                    return code != 259 /* STILL_ACTIVE */;
                }
            }

            internal int ExitCode
            {
                get
                {
                    uint code;
                    if (Handle != IntPtr.Zero && GetExitCodeProcess(Handle, out code)) return (int)code;
                    return -1;
                }
            }

            /// <summary>等待进程结束（毫秒），返回 true 表示已退出。</summary>
            internal bool WaitForExit(uint milliseconds)
            {
                if (Handle == IntPtr.Zero) return true;
                return WaitForSingleObject(Handle, milliseconds) != 258u /* WAIT_TIMEOUT */;
            }

            internal void Kill()
            {
                if (Handle != IntPtr.Zero) { try { TerminateProcess(Handle, 1); } catch { } }
            }

            public void Dispose()
            {
                if (Handle != IntPtr.Zero) { CloseHandle(Handle); Handle = IntPtr.Zero; }
            }
        }

        /// <summary>
        /// 用 Win32 CreateProcess 启动 dsh 服务进程。
        /// 环境块只保留运行所需变量，并按"同名取最后一个"去重，规避 .NET 环境字典的重复键异常。
        /// stdout/stderr 写入 app 目录下的 service.log（避免管道缓冲区满阻塞子进程）。
        /// </summary>
        internal static ServiceProcess Start(string exePath, string arguments, string workingDirectory, string nodePath)
        {
            return Start(exePath, arguments, workingDirectory, nodePath, null);
        }

        /// <summary>
        /// 带 DSH_HOME 的启动：把 dsh 全部用户数据目录（凭据/会话/profile/插件）
        /// 指到指定位置，实现"数据目录可自选、默认不占 C 盘"。
        /// </summary>
        internal static ServiceProcess Start(string exePath, string arguments, string workingDirectory,
                                             string nodePath, string dshHome)
        {
            // 1) 组装去重后的环境变量（大小写不敏感去重，保留最后一个值）
            var merged = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (System.Collections.DictionaryEntry de in Environment.GetEnvironmentVariables())
            {
                string k = de.Key as string;
                string v = de.Value as string;
                if (string.IsNullOrEmpty(k)) continue;
                merged[k] = v; // 同名后写覆盖前写，等价于 Windows 的行为
            }
            // ⚠ 必须剥离 NODE_OPTIONS。
            //   NODE_OPTIONS 里常见的是 `--require=<某个 shim.cjs>`，用于给 node 进程注入
            //   宿主环境的钩子。本机实测踩过的坑：WorkBuddy 的沙箱会注入
            //     NODE_OPTIONS=--require=".../sandbox-center-runtime-kit/shim/node-language-shim.cjs"
            //   该 shim 接管了 fs.rm，DSH 的 @deepseek-ai/dsh-atomic-write 在 withFileLock
            //   里 `rm(lockPath, {force:true})` 清理写锁时被它拦下 → 锁文件删不掉 →
            //   下次启动抢不到锁 → connection 插件激活失败 → web-runtime 拿不到 webServer →
            //   端口从不监听 → 界面只看到 HTTP ERROR 404。
            //   只要 KK Go 是从带这个环境变量的宿主里启动的（IDE、终端、自动化宿主），
            //   子进程就会原样继承，DSH 必崩。
            //   dsh 是独立运行的 node 服务，不该吃任何宿主的注入钩子 —— 一律清掉。
            //   已在当前进程也清一遍：CreateProcess 走"继承父进程环境"的回退分支时，
            //   继承来的就是当前进程环境。
            foreach (string poison in PoisonedEnvVars)
            {
                if (merged.Remove(poison))
                {
                    try { Environment.SetEnvironmentVariable(poison, null, EnvironmentVariableTarget.Process); }
                    catch { }
                }
            }
            // dsh 解析 @deepseek-ai/* 依赖需要 NODE_PATH
            merged["NODE_PATH"] = nodePath;
            // 同时写入当前进程环境：CreateProcess 继承父进程环境时才能带上 NODE_PATH
            try { Environment.SetEnvironmentVariable("NODE_PATH", nodePath, EnvironmentVariableTarget.Process); }
            catch { }
            // DSH_HOME：dsh 所有用户数据（凭据、会话、profile、插件、workspace）的根。
            // 显式指定后可把数据整体挪出 C 盘（见 Launcher.DataDir）。
            if (!string.IsNullOrEmpty(dshHome))
            {
                merged["DSH_HOME"] = dshHome;
                try { Environment.SetEnvironmentVariable("DSH_HOME", dshHome, EnvironmentVariableTarget.Process); }
                catch { }
            }
            // Node 在 Windows 上需要 SystemRoot 才能定位系统目录
            if (!merged.ContainsKey("SystemRoot"))
            {
                string sr = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                if (!string.IsNullOrEmpty(sr)) merged["SystemRoot"] = sr;
            }
            if (!merged.ContainsKey("TEMP")) merged["TEMP"] = Path.GetTempPath();
            if (!merged.ContainsKey("TMP")) merged["TMP"] = Path.GetTempPath();

            // 2) 构造 Unicode 环境块
            //    格式: "NAME=VALUE\0NAME2=VALUE2\0\0"
            //    注意结尾必须是 **两个** UTF-16 NUL（4 字节）。只追加一个 '\0' 会让
            //    CreateProcess 认为块未正常终止，直接返回错误码 87 (ERROR_INVALID_PARAMETER)。
            var envBlock = new StringBuilder();
            foreach (var kv in merged)
            {
                // 变量名/值里不能含 NUL，否则环境块结构会被破坏
                string k = kv.Key.Replace('\0', ' ');
                string v = (kv.Value ?? string.Empty).Replace('\0', ' ');
                envBlock.Append(k).Append('=').Append(v).Append('\0');
            }
            envBlock.Append('\0').Append('\0');
            byte[] envBytes = Encoding.Unicode.GetBytes(envBlock.ToString());
            IntPtr envPtr = Marshal.AllocHGlobal(envBytes.Length);
            Marshal.Copy(envBytes, 0, envPtr, envBytes.Length);

            // 3) 日志文件作为子进程 stdout/stderr（文件句柄不会被缓冲区问题卡住）
            //
            //    ⚠ 关键点：句柄必须"可继承"才能真正传给子进程。
            //    CreateFile 时若 lpSecurityAttributes 传 NULL，句柄默认不可继承，
            //    此时即便 CreateProcess 传了 bInheritHandles=TRUE，子进程拿到的
            //    hStdOutput/hStdError 也全是无效值 —— 表现为 service.log 永远 0 字节、
            //    启动器以为服务起来了但日志里永远没有 dsh 打印的访问地址。
            //    所以这里必须显式传 SECURITY_ATTRIBUTES{ bInheritHandle = TRUE }。
            string logPath = Path.Combine(workingDirectory, "service.log");
            // FILE_APPEND_DATA(0x4) 保证多次启动日志追加而不是互相覆盖
            IntPtr hOut = CreateInheritableFile(logPath,
                0x40000000 /*GENERIC_WRITE*/ | 0x00000004 /*FILE_APPEND_DATA*/,
                0x00000001 /*FILE_SHARE_READ*/ | 0x00000002 /*FILE_SHARE_WRITE*/,
                4 /*OPEN_ALWAYS*/, 0x80 /*FILE_ATTRIBUTE_NORMAL*/);
            // stdin 固定接到 NUL 设备：父进程的标准输入句柄在 GUI/后台启动场景下
            // 往往无效（INVALID_HANDLE_VALUE），直接传给子进程会让 node 启动异常。
            IntPtr hIn = CreateInheritableFile("NUL",
                0x80000000 /*GENERIC_READ*/,
                0x00000001 | 0x00000002,
                3 /*OPEN_EXISTING*/, 0x80);
            if (hIn == IntPtr.Zero || hIn == new IntPtr(-1)) hIn = hOut;

            var si = new STARTUPINFO();
            si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
            si.dwFlags = (int)STARTF_USESHOWWINDOW;
            si.wShowWindow = SW_HIDE;
            if (hOut != IntPtr.Zero && hOut != new IntPtr(-1))
            {
                si.dwFlags |= (int)STARTF_USESTDHANDLES;
                si.hStdInput = hIn;
                si.hStdOutput = hOut;
                si.hStdError = hOut;
            }

            var pi = new PROCESS_INFORMATION();
            // 命令行必须用 StringBuilder 传递：Win32 要求该缓冲区可写，
            // 直接传 string 会被封送成只读，CreateProcess 可能返回 87。
            var cmdLine = new System.Text.StringBuilder("\"" + exePath + "\" " + arguments);
            bool ok;
            int firstError = 0;
            try
            {
                // 传入自建环境块（去重后）。若 Win32 拒绝该块，错误码 87。
                ok = CreateProcessW(exePath, cmdLine, IntPtr.Zero, IntPtr.Zero, true,
                    CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP, envPtr, workingDirectory, ref si, out pi);
                if (!ok)
                {
                    firstError = Marshal.GetLastWin32Error();
                    // 回退：让子进程直接继承父进程环境（lpEnvironment = NULL）。
                    // 继承的环境同样含 Path/PATH/path 重复项，但 CreateProcess 原生层
                    // 不做大小写不敏感去重，因此可以正常通过。
                    // NODE_PATH 已提前写入当前进程环境，继承时自然带上。
                    ok = CreateProcessW(exePath, cmdLine, IntPtr.Zero, IntPtr.Zero, true,
                        CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP, IntPtr.Zero, workingDirectory, ref si, out pi);
                    if (!ok)
                    {
                        int err2 = Marshal.GetLastWin32Error();
                        throw new InvalidOperationException(
                            "CreateProcess 失败，Win32 错误码 " + firstError + "/" + err2);
                    }
                }
            }
            finally
            {
                Marshal.FreeHGlobal(envPtr);
                if (hOut != IntPtr.Zero && hOut != new IntPtr(-1)) CloseHandle(hOut);
                if (hIn != IntPtr.Zero && hIn != new IntPtr(-1) && hIn != hOut) CloseHandle(hIn);
            }

            if (!ok)
            {
                int err = Marshal.GetLastWin32Error();
                throw new InvalidOperationException("CreateProcess 失败，Win32 错误码 " + err);
            }
            if (pi.hThread != IntPtr.Zero) CloseHandle(pi.hThread);
            var svc = new ServiceProcess();
            svc.Handle = pi.hProcess;
            svc.ProcessId = pi.dwProcessId;
            return svc;
        }
    }
}
