Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int hh,bool r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int s);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int hh,uint f);
}
'@
$HWND_TOPMOST = [IntPtr]::new(-1)
Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object {
  $h = $_.MainWindowHandle
  if ($h -ne 0) {
    $t = $_.MainWindowTitle
    if ($t -match 'Chrome for Testing') {
      [W]::MoveWindow($h, 30, 20, 1296, 920, $true) | Out-Null
      [W]::SetWindowPos($h, $HWND_TOPMOST, 0,0,0,0, 0x0003) | Out-Null
      Write-Output "resized+topmost $h : $t"
    } else {
      [W]::ShowWindow($h, 6) | Out-Null   # minimize non-test chrome windows
      Write-Output "minimized $h : $t"
    }
  }
}
