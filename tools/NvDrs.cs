// nv-drs.exe - reads/writes NVIDIA driver profile settings (DRS) for a game.
//   nv-drs.exe get <game.exe> <id>[,<id>...]
//   nv-drs.exe set <game.exe> <id>=<value|default> [<id>=<value|default> ...]
// IDs and values hexadecimal (0x...) or decimal. "default" removes the setting from the game profile.
// Output: one line of JSON.
// Compatible with nr-preset.exe:  get <exe>  /  set <exe> A|B|auto   (DLSS-NR Preset 0x10E41DF8)
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

static class NvDrs
{
    const int OK = 0, PROFILE_NOT_FOUND = -163, EXECUTABLE_NOT_FOUND = -166, SETTING_NOT_FOUND = -160;
    const uint NR_PRESET = 0x10E41DF8;
    const int USTR = 4096;
    const int SETTING_SIZE = 4 + USTR + 5 * 4 + 4100 + 4100;
    const int PROFILE_SIZE = 4 + USTR + 4 * 4;
    const int APP_SIZE = 4 + 4 + USTR * 4 + 4;
    const int OFF_ID = 4 + USTR, OFF_TYPE = OFF_ID + 4, OFF_LOC = OFF_ID + 8, OFF_CUR = OFF_ID + 20 + 4100;

    [DllImport("nvapi64.dll", EntryPoint = "nvapi_QueryInterface", CallingConvention = CallingConvention.Cdecl)]
    static extern IntPtr QueryInterface(uint id);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int D0();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DOutH(out IntPtr h);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DH(IntPtr h);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DFindApp(IntPtr s, byte[] name, out IntPtr profile, byte[] app);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DFindProfile(IntPtr s, byte[] name, out IntPtr profile);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DGetSetting(IntPtr s, IntPtr p, uint id, byte[] setting);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DSetSetting(IntPtr s, IntPtr p, byte[] setting);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DDelSetting(IntPtr s, IntPtr p, uint id);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DCreateProfile(IntPtr s, byte[] profile, out IntPtr h);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DCreateApp(IntPtr s, IntPtr p, byte[] app);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DProfileInfo(IntPtr s, IntPtr p, byte[] profile);

    static T Fn<T>(uint id) where T : class
    {
        IntPtr p = QueryInterface(id);
        if (p == IntPtr.Zero) throw new Exception("NvAPI function missing: 0x" + id.ToString("X8"));
        return Marshal.GetDelegateForFunctionPointer(p, typeof(T)) as T;
    }
    static void PutU32(byte[] b, int off, uint v) { BitConverter.GetBytes(v).CopyTo(b, off); }
    static uint GetU32(byte[] b, int off) { return BitConverter.ToUInt32(b, off); }
    static void PutStr(byte[] b, int off, string s) { byte[] t = Encoding.Unicode.GetBytes(s); Array.Copy(t, 0, b, off, Math.Min(t.Length, USTR - 2)); }
    static string GetStr(byte[] b, int off) { string s = Encoding.Unicode.GetString(b, off, USTR); int z = s.IndexOf('\0'); return z >= 0 ? s.Substring(0, z) : s; }
    static byte[] UStr(string s) { byte[] b = new byte[USTR]; PutStr(b, 0, s); return b; }
    static string Esc(string s) { return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""); }
    static string Hex(uint v) { return "0x" + v.ToString("X8"); }
    static uint ParseU32(string s)
    {
        s = s.Trim();
        if (s.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) return uint.Parse(s.Substring(2), NumberStyles.HexNumber);
        return uint.Parse(s, CultureInfo.InvariantCulture);
    }
    class NvException : Exception { public int Code; public NvException(int c, string w) : base(w + " fehlgeschlagen (NvAPI " + c + ")") { Code = c; } }
    static void Check(int r, string what) { if (r != OK) throw new NvException(r, what); }

    static IntPtr session, profile;
    static bool found;

    static void Open(string exe)
    {
        Check(Fn<D0>(0x0150E828)(), "NvAPI_Initialize");
        Check(Fn<DOutH>(0x0694D52E)(out session), "DRS_CreateSession");
        Check(Fn<DH>(0x375DBD6B)(session), "DRS_LoadSettings");
        byte[] app = new byte[APP_SIZE];
        PutU32(app, 0, (uint)(APP_SIZE | (3 << 16)));
        int r = Fn<DFindApp>(0xEEE566B2)(session, UStr(exe), out profile, app);
        if (r != OK && r != EXECUTABLE_NOT_FOUND) Check(r, "DRS_FindApplicationByName");
        found = r == OK;
    }

    static void EnsureProfile(string exe)
    {
        if (found) return;
        string name = "DLSS5 Swapper - " + exe;
        int r = Fn<DFindProfile>(0x7E4A9A0B)(session, UStr(name), out profile);
        if (r == PROFILE_NOT_FOUND)
        {
            byte[] p = new byte[PROFILE_SIZE];
            PutU32(p, 0, (uint)(PROFILE_SIZE | (1 << 16)));
            PutStr(p, 4, name);
            PutU32(p, 4 + USTR, 0x3);
            Check(Fn<DCreateProfile>(0xCC176068)(session, p, out profile), "DRS_CreateProfile");
        }
        else Check(r, "DRS_FindProfileByName");
        byte[] a = new byte[APP_SIZE];
        PutU32(a, 0, (uint)(APP_SIZE | (3 << 16)));
        PutStr(a, 8, exe);
        Check(Fn<DCreateApp>(0x4347A9DE)(session, profile, a), "DRS_CreateApplication");
        found = true;
    }

    static void Write(uint id, uint? value)
    {
        if (value == null)
        {
            int r = Fn<DDelSetting>(0xE4A26362)(session, profile, id);
            if (r != OK && r != SETTING_NOT_FOUND) Check(r, "DRS_DeleteProfileSetting " + Hex(id));
            return;
        }
        byte[] st = new byte[SETTING_SIZE];
        PutU32(st, 0, (uint)(SETTING_SIZE | (1 << 16)));
        PutU32(st, OFF_ID, id);
        PutU32(st, OFF_TYPE, 0);
        PutU32(st, OFF_CUR, value.Value);
        Check(Fn<DSetSetting>(0x577DD202)(session, profile, st), "DRS_SetSetting " + Hex(id));
    }

    // value, source ("game"/"global"/"base"/"default") or null when not set
    static string Read(uint id, out uint value)
    {
        value = 0;
        if (!found) return null;
        byte[] st = new byte[SETTING_SIZE];
        PutU32(st, 0, (uint)(SETTING_SIZE | (1 << 16)));
        int r = Fn<DGetSetting>(0x73BF8338)(session, profile, id, st);
        if (r == SETTING_NOT_FOUND) return null;
        Check(r, "DRS_GetSetting " + Hex(id));
        value = GetU32(st, OFF_CUR);
        uint loc = GetU32(st, OFF_LOC);
        return loc == 0 ? "game" : loc == 1 ? "global" : loc == 2 ? "base" : "default";
    }

    static string ProfileName()
    {
        if (!found) return null;
        byte[] p = new byte[PROFILE_SIZE];
        PutU32(p, 0, (uint)(PROFILE_SIZE | (1 << 16)));
        return Fn<DProfileInfo>(0x61CD6FD6)(session, profile, p) == OK ? GetStr(p, 4) : null;
    }

    static string Result(string exe, List<uint> ids)
    {
        var sb = new StringBuilder();
        sb.Append("{\"ok\":true,\"exe\":\"").Append(Esc(exe)).Append("\",\"profile\":");
        string pn = ProfileName();
        sb.Append(pn == null ? "null" : "\"" + Esc(pn) + "\"").Append(",\"values\":{");
        for (int i = 0; i < ids.Count; i++)
        {
            uint v; string src = Read(ids[i], out v);
            if (i > 0) sb.Append(',');
            sb.Append('"').Append(Hex(ids[i])).Append("\":");
            sb.Append(src == null ? "null" : "{\"value\":\"" + Hex(v) + "\",\"source\":\"" + src + "\"}");
        }
        return sb.Append("}}").ToString();
    }

    static string Letter(uint v) { return v == 1 ? "A" : v == 2 ? "B" : "auto"; }

    // DLSS indicator: HKLM\SOFTWARE\NVIDIA Corporation\Global\NGXCore
    //   ShowDlssIndicator (0 / 1024)  = SR info bottom left
    //   DLSSG_IndicatorText (0/1/2)   = Frame Generation info (off/short/detailed)
    static int Indicator(string[] args)
    {
        const string KEY = @"SOFTWARE\NVIDIA Corporation\Global\NGXCore";
        using (var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
        {
            if (args.Length >= 3)
            {
                uint sr = ParseU32(args[1]), fg = ParseU32(args[2]);
                if ((sr != 0 && sr != 1024) || fg > 2) throw new Exception("Values: SR 0|1024, FG 0|1|2");
                try
                {
                    using (var k = hklm.OpenSubKey(KEY, true))
                    {
                        if (k == null) throw new Exception("NGXCore registry key missing (is the NVIDIA driver installed?)");
                        k.SetValue("ShowDlssIndicator", (int)sr, RegistryValueKind.DWord);
                        k.SetValue("DLSSG_IndicatorText", (int)fg, RegistryValueKind.DWord);
                    }
                }
                catch (System.Security.SecurityException) { Console.WriteLine("{\"ok\":false,\"code\":-137,\"message\":\"No write access\"}"); return 2; }
                catch (UnauthorizedAccessException) { Console.WriteLine("{\"ok\":false,\"code\":-137,\"message\":\"No write access\"}"); return 2; }
            }
            using (var k = hklm.OpenSubKey(KEY, false))
            {
                object a = k == null ? null : k.GetValue("ShowDlssIndicator"), b = k == null ? null : k.GetValue("DLSSG_IndicatorText");
                Console.WriteLine("{\"ok\":true,\"sr\":" + (a == null ? 0 : Convert.ToInt64(a)) + ",\"fg\":" + (b == null ? 0 : Convert.ToInt64(b)) + "}");
            }
        }
        return 0;
    }

    // sigcheck <file>: check Authenticode (WinVerifyTrust) + signer + file version
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WINTRUST_FILE_INFO { public uint cbStruct; public string pcwszFilePath; public IntPtr hFile; public IntPtr pgKnownSubject; }
    [StructLayout(LayoutKind.Sequential)]
    struct WINTRUST_DATA { public uint cbStruct; public IntPtr pPolicyCallbackData; public IntPtr pSIPClientData; public uint dwUIChoice; public uint fdwRevocationChecks; public uint dwUnionChoice; public IntPtr pFile; public uint dwStateAction; public IntPtr hWVTStateData; public IntPtr pwszURLReference; public uint dwProvFlags; public uint dwUIContext; public IntPtr pSignatureSettings; }
    [DllImport("wintrust.dll", CharSet = CharSet.Unicode)]
    static extern int WinVerifyTrust(IntPtr hwnd, ref Guid action, ref WINTRUST_DATA data);
    static int SigCheck(string file)
    {
        if (!System.IO.File.Exists(file)) throw new Exception("File not found");
        var fi = new WINTRUST_FILE_INFO { cbStruct = (uint)Marshal.SizeOf(typeof(WINTRUST_FILE_INFO)), pcwszFilePath = System.IO.Path.GetFullPath(file) };
        IntPtr pFi = Marshal.AllocHGlobal(Marshal.SizeOf(fi)); Marshal.StructureToPtr(fi, pFi, false);
        var wd = new WINTRUST_DATA { cbStruct = (uint)Marshal.SizeOf(typeof(WINTRUST_DATA)), dwUIChoice = 2, dwUnionChoice = 1, pFile = pFi };
        var action = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");
        int rc;
        try { rc = WinVerifyTrust(IntPtr.Zero, ref action, ref wd); } finally { Marshal.FreeHGlobal(pFi); }
        string signer = "";
        try { var c = System.Security.Cryptography.X509Certificates.X509Certificate.CreateFromSignedFile(file); signer = new System.Security.Cryptography.X509Certificates.X509Certificate2(c).GetNameInfo(System.Security.Cryptography.X509Certificates.X509NameType.SimpleName, false); } catch { }
        var v = System.Diagnostics.FileVersionInfo.GetVersionInfo(file);
        string ver = v.FileMajorPart + "." + v.FileMinorPart + "." + v.FileBuildPart + "." + v.FilePrivatePart;
        Console.WriteLine("{\"ok\":true,\"valid\":" + (rc == 0 ? "true" : "false") + ",\"code\":" + rc + ",\"signer\":\"" + Esc(signer) + "\",\"version\":\"" + ver + "\",\"product\":\"" + Esc(v.ProductName) + "\"}");
        return 0;
    }

    static int Main(string[] args)
    {
        try
        {
            if (args.Length >= 1 && args[0].ToLowerInvariant() == "indicator") return Indicator(args);
            if (args.Length >= 2 && args[0].ToLowerInvariant() == "sigcheck") return SigCheck(args[1]);
            if (args.Length < 2 || !args[1].EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                throw new Exception("Usage: get <game.exe> <id,...> | set <game.exe> <id>=<value|default> ...");
            string mode = args[0].ToLowerInvariant(), exe = args[1];
            Open(exe);
            try
            {
                // --- compatibility with nr-preset.exe ---
                if (mode == "get" && args.Length == 2) args = new[] { "get", exe, Hex(NR_PRESET) };
                bool legacySet = mode == "set" && args.Length == 3 && args[2].IndexOf('=') < 0;
                if (legacySet)
                {
                    string w = args[2].ToUpperInvariant();
                    if (w != "A" && w != "B" && w != "AUTO") throw new Exception("Preset must be A, B or auto");
                    args = new[] { "set", exe, Hex(NR_PRESET) + "=" + (w == "AUTO" ? "default" : (w == "A" ? "1" : "2")) };
                }

                var ids = new List<uint>();
                if (mode == "get")
                {
                    foreach (string part in args[2].Split(',')) if (part.Trim().Length > 0) ids.Add(ParseU32(part));
                }
                else if (mode == "set")
                {
                    var changes = new List<KeyValuePair<uint, uint?>>();
                    for (int i = 2; i < args.Length; i++)
                    {
                        int eq = args[i].IndexOf('=');
                        if (eq < 0) throw new Exception("Expected <id>=<value>: " + args[i]);
                        uint id = ParseU32(args[i].Substring(0, eq));
                        string val = args[i].Substring(eq + 1);
                        changes.Add(new KeyValuePair<uint, uint?>(id, val.Equals("default", StringComparison.OrdinalIgnoreCase) ? (uint?)null : ParseU32(val)));
                        ids.Add(id);
                    }
                    bool anyValue = changes.Exists(c => c.Value != null);
                    if (anyValue) EnsureProfile(exe);
                    if (found)
                    {
                        foreach (var c in changes) Write(c.Key, c.Value);
                        Check(Fn<DH>(0xFCBC7E14)(session), "DRS_SaveSettings");
                    }
                }
                else throw new Exception("Unknown command: " + mode);

                if (legacySet || (mode == "get" && ids.Count == 1 && ids[0] == NR_PRESET && args.Length == 3 && args[2] == Hex(NR_PRESET)))
                {
                    uint v; string src = Read(NR_PRESET, out v); string pn = ProfileName();
                    Console.WriteLine("{\"ok\":true,\"exe\":\"" + Esc(exe) + "\",\"preset\":\"" + (src == null ? "auto" : Letter(v)) + "\",\"source\":\"" + (src ?? "none") +
                                      "\",\"profile\":" + (pn == null ? "null" : "\"" + Esc(pn) + "\"") + "}");
                }
                else Console.WriteLine(Result(exe, ids));
                return 0;
            }
            finally { Fn<DH>(0xDAD9CFF8)(session); }
        }
        catch (NvException e) { Console.WriteLine("{\"ok\":false,\"code\":" + e.Code + ",\"message\":\"" + Esc(e.Message) + "\"}"); return 2; }
        catch (Exception e) { Console.WriteLine("{\"ok\":false,\"code\":0,\"message\":\"" + Esc(e.Message) + "\"}"); return 1; }
    }
}
