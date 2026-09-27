#include <Array.au3>
#include <WinAPI.au3>
#include <WinAPIProc.au3>

If $CmdLine[0] < 1 Then Exit

Func _OwnProcessTree($sPids)
    Local $aPids = StringSplit($sPids, ",")
    Local $sAllowed = ","

    For $i = 1 To $aPids[0]
        Local $iPid = Number(StringStripWS($aPids[$i], 8))
        If $iPid <= 0 Then ContinueLoop

        Local $sName = _WinAPI_GetProcessFileName($iPid)
        Local $iCurrent = $iPid
        Local $iGuard = 0

        While $iCurrent > 0 And $iGuard < 8
            If Not StringInStr($sAllowed, "," & $iCurrent & ",") Then $sAllowed &= $iCurrent & ","

            Local $iParent = _WinAPI_GetParentProcess($iCurrent)
            If $iParent <= 0 Then ExitLoop
            If _WinAPI_GetProcessFileName($iParent) <> $sName Then ExitLoop

            $iCurrent = $iParent
            $iGuard += 1
        WEnd
    Next

    Return $sAllowed
EndFunc

If $CmdLine[1] = "active" Then
    Local $hActive = WinGetHandle("[ACTIVE]")
    If Not @error Then ConsoleWrite($hActive)
EndIf

If $CmdLine[1] = "list" Then
    Local $sAllowedPids = ""
    If $CmdLine[0] > 1 And StringStripWS($CmdLine[2], 8) <> "" Then $sAllowedPids = _OwnProcessTree($CmdLine[2])

    Local $aList = WinList()
    Local $sJSON = "["
    Local $first = 1

    For $i = 1 To $aList[0][0]
        Local $handle = $aList[$i][1]
        Local $title = $aList[$i][0]

        If $title <> "" And BitAND(WinGetState($handle), 2) Then
            Local $iPID = WinGetProcess($handle)
            Local $sPath = _WinAPI_GetProcessFileName($iPID)

            If $sAllowedPids <> "" And Not StringInStr($sAllowedPids, "," & $iPID & ",") Then ContinueLoop

            Local $isTarget = False
            If StringInStr($sPath, "SunBrowser") OR StringInStr($sPath, "anty") OR StringInStr($sPath, "dolphin") Then
                $isTarget = True
            EndIf
            
            If Not $isTarget Then
                If StringInStr($title, "SunBrowser") OR StringInStr($title, "Anty") OR StringInStr($title, "Dolphin") Then
                    $isTarget = True
                EndIf
            EndIf

            If $isTarget Then
                If Not StringInStr($title, "Dolphin{anty}") Then
                    If BitAND(WinGetState($handle), 16) Then
                        WinSetState($handle, "", @SW_RESTORE)
                        Sleep(150)
                    EndIf

                    Local $aPos = WinGetPos($handle)
                    If IsArray($aPos) Then
                        Local $hasZeroSize = ($aPos[2] <= 0) Or ($aPos[3] <= 0)
                        
                        If Not $hasZeroSize Then
                             If $first = 0 Then $sJSON &= ","
                             $title = StringReplace($title, '\\', '\\\\')
                             $title = StringReplace($title, '"', '\\"')
                             $sJSON &= '{"handle":"' & $handle & '","title":"' & $title & '","x":' & $aPos[0] & ',"y":' & $aPos[1] & ',"w":' & $aPos[2] & ',"h":' & $aPos[3] & '}'
                             $first = 0
                        EndIf
                    EndIf
                EndIf
            EndIf
        EndIf
    Next
    $sJSON &= "]"
    ConsoleWrite($sJSON)
EndIf

If $CmdLine[1] = "move" Then
    Local $hwnd = HWnd($CmdLine[2])
    If BitAND(WinGetState($hwnd), 16) Then
        WinSetState($hwnd, "", @SW_RESTORE)
        Sleep(100)
    EndIf
    WinMove($hwnd, "", Number($CmdLine[3]), Number($CmdLine[4]), Number($CmdLine[5]), Number($CmdLine[6]))
EndIf

If $CmdLine[1] = "activate" Then
    Local $sHandles = $CmdLine[2]
    Local $aHandles = StringSplit($sHandles, ",")
    
    For $i = 1 To $aHandles[0]
        Local $hwnd = HWnd($aHandles[$i])
        
        If BitAND(WinGetState($hwnd), 16) Then
            WinSetState($hwnd, "", @SW_RESTORE)
            Sleep(50) 
        EndIf
        
        WinActivate($hwnd)
        Sleep(10)
    Next
EndIf

If $CmdLine[1] = "activate_terminal" Then
    Local $aList = WinList()
    For $i = 1 To $aList[0][0]
        Local $handle = $aList[$i][1]
        Local $iPID = WinGetProcess($handle)
        Local $sPath = _WinAPI_GetProcessFileName($iPID)
        
        If StringInStr($sPath, "WindowsTerminal") OR StringInStr($sPath, "wt.exe") Then
            If BitAND(WinGetState($handle), 16) Then
                WinSetState($handle, "", @SW_RESTORE)
                Sleep(100)
            EndIf
            WinActivate($handle)
            ExitLoop
        EndIf
    Next
EndIf