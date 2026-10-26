#include <AutoItConstants.au3>

Local $delayPath = @ScriptDir & "\delay_win.toml"
Local $lightshotDelay = 300

Local $dFile = FileOpen($delayPath, 0)
If $dFile <> -1 Then
    While 1
        Local $line = FileReadLine($dFile)
        If @error = -1 Then ExitLoop
        
        If StringInStr($line, "lightshot_delay") Then
            Local $parts = StringSplit($line, "=", 2)
            If UBound($parts) > 1 Then
                $lightshotDelay = Number(StringStripWS($parts[1], 8)) 
            EndIf
            ExitLoop 
        EndIf
    WEnd
    FileClose($dFile)
EndIf

Local $filePath = @ScriptDir & "\keybind.txt"
Local $file = FileOpen($filePath, 0)
If $file = -1 Then
    Exit
EndIf

Local $combos[2]
$i = 0
While 1 And $i < 2
    Local $line = FileReadLine($file)
    If @error = -1 Then ExitLoop
    
    $line = StringStripWS($line, 3)
    If $line <> "" Then
        $combos[$i] = $line
        $i += 1
    EndIf
WEnd
FileClose($file)

If $i > 0 Then
    _SendKeyCombination($combos[0])
    If $i > 1 Then Sleep($lightshotDelay)
EndIf

If $i > 1 Then
    _SendKeyCombination($combos[1])
EndIf

Func _SendKeyCombination($combo)
    Local $keys = StringSplit($combo, "+", 2)
    Local $modifiers = 0
    Local $key = ""
    
    For $j = 0 To UBound($keys) - 1
        $keys[$j] = StringStripWS($keys[$j], 3)
        Switch StringLower($keys[$j])
            Case "ctrl", "crtl" 
                $modifiers = BitOR($modifiers, 2)
            Case "alt"
                $modifiers = BitOR($modifiers, 1)
            Case "shift"
                $modifiers = BitOR($modifiers, 4)
            Case "win"
                $modifiers = BitOR($modifiers, 8)
            Case Else
                $key = $keys[$j]
        EndSwitch
    Next
    
    If $key <> "" Then
        Local $vk = _GetVirtualKey($key)
        _SendEx($vk, $modifiers)
    EndIf
EndFunc

Func _GetVirtualKey($key)
    If StringLen($key) = 1 Then
        If StringRegExp($key, "(?i)[a-z]") Then
            Return Asc(StringUpper($key))
        ElseIf StringRegExp($key, "[0-9]") Then
            Return Asc($key)
        EndIf
    EndIf
    
    Switch StringLower($key)
        Case "f1" 
            Return 0x70
        Case "f2"
            Return 0x71
        Case "f3"
            Return 0x72
        Case "f4"
            Return 0x73
        Case "f5"
            Return 0x74
        Case "f6"
            Return 0x75
        Case "f7"
            Return 0x76
        Case "f8"
            Return 0x77
        Case "f9"
            Return 0x78
        Case "f10"
            Return 0x79
        Case "f11"
            Return 0x7A
        Case "f12"
            Return 0x7B
        Case "enter", "return"
            Return 0x0D
        Case "escape", "esc"
            Return 0x1B
        Case "tab"
            Return 0x09
        Case "space"
            Return 0x20
        Case "backspace"
            Return 0x08
        Case "delete", "del"
            Return 0x2E
        Case "insert", "ins"
            Return 0x2D
        Case "home"
            Return 0x24
        Case "end"
            Return 0x23
        Case "pageup"
            Return 0x21
        Case "pagedown"
            Return 0x22
        Case "up"
            Return 0x26
        Case "down"
            Return 0x28
        Case "left"
            Return 0x25
        Case "right"
            Return 0x27
        Case Else
            Return Asc(StringUpper($key))
    EndSwitch
EndFunc

Func _SendEx($vk, $modifiers = 0)
    If BitAND($modifiers, 2) Then
        DllCall("user32.dll", "int", "keybd_event", "int", 0x11, "int", 0, "int", 0, "ptr", 0)
    EndIf
    If BitAND($modifiers, 1) Then
        DllCall("user32.dll", "int", "keybd_event", "int", 0x12, "int", 0, "int", 0, "ptr", 0)
    EndIf
    If BitAND($modifiers, 4) Then
        DllCall("user32.dll", "int", "keybd_event", "int", 0x10, "int", 0, "int", 0, "ptr", 0)
    EndIf
    If BitAND($modifiers, 8) Then
        DllCall("user32.dll", "int", "keybd_event", "int", 0x5B, "int", 0, "int", 0, "ptr", 0)
    EndIf
   
    DllCall("user32.dll", "int", "keybd_event", "int", $vk, "int", 0, "int", 0, "ptr", 0)
    Sleep(20)
    DllCall("user32.dll", "int", "keybd_event", "int", $vk, "int", 0, "int", 2, "ptr", 0)
    
    If BitAND($modifiers, 8) Then
        DllCall("user32.dll", "int", "keybd_event", "int", 0x5B, "int", 0, "int", 2, "ptr", 0)
    EndIf
    If BitAND($modifiers, 4) Then
        DllCall("user32.dll", "int", "keybd_event", "int", 0x10, "int", 0, "int", 2, "ptr", 0)
    EndIf
    If BitAND($modifiers, 1) Then
        DllCall("user32.dll", "int", "keybd_event", "int", 0x12, "int", 0, "int", 2, "ptr", 0)
    EndIf
    If BitAND($modifiers, 2) Then
        DllCall("user32.dll", "int", "keybd_event", "int", 0x11, "int", 0, "int", 2, "ptr", 0)
    EndIf
EndFunc