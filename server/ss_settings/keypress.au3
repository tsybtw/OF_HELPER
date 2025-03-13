#include <AutoItConstants.au3>

Local $isEnglishLayout = _IsEnglishKeyboardLayout()

Local $filePath = @ScriptDir & "./keybind.txt"
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
    If $isEnglishLayout Then
        _SendDirectCombination($combos[0])
    Else
        _SendKeyCombination($combos[0])
    EndIf
    Sleep(300)
EndIf

If $i > 1 Then
    If $isEnglishLayout Then
        _SendDirectCombination($combos[1])
    Else
        _SendKeyCombination($combos[1])
    EndIf
EndIf

Func _IsEnglishKeyboardLayout()
    Local $hWnd = WinGetHandle("[ACTIVE]")
    Local $currentLayout = DllCall("user32.dll", "int", "GetKeyboardLayout", "int", DllCall("user32.dll", "int", "GetWindowThreadProcessId", "hwnd", $hWnd, "ptr", 0)[0])
    Local $langID = BitAND($currentLayout[0], 0xFFFF)
    Return ($langID = 0x0409 Or $langID = 0x0809)
EndFunc

Func _SendDirectCombination($combo)
    Local $keys = StringSplit($combo, "+", 2)
    Local $autoItKeys = ""
    
    For $j = 0 To UBound($keys) - 1
        Switch StringLower($keys[$j])
            Case "ctrl", "crtl"
                $autoItKeys &= "^"
            Case "alt"
                $autoItKeys &= "!"
            Case "shift"
                $autoItKeys &= "+"
            Case "win"
                $autoItKeys &= "#"
            Case Else
                $autoItKeys &= $keys[$j]
        EndSwitch
    Next
    
    Send($autoItKeys)
EndFunc

Func _SendKeyCombination($combo)
    Local $keys = StringSplit($combo, "+", 2)
    Local $modifiers = 0
    Local $key = ""
    
    For $j = 0 To UBound($keys) - 1
        Switch StringLower($keys[$j])
            Case "ctrl", "crtl" 
                $modifiers = BitOR($modifiers, 2) ; CTRL = 2
            Case "alt"
                $modifiers = BitOR($modifiers, 1) ; ALT = 1
            Case "shift"
                $modifiers = BitOR($modifiers, 4) ; SHIFT = 4
            Case "win"
                $modifiers = BitOR($modifiers, 8) ; WIN = 8
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
    If BitAND($modifiers, 2) Then ; CTRL
        DllCall("user32.dll", "int", "keybd_event", "int", 0x11, "int", 0, "int", 0, "ptr", 0)
    EndIf
    If BitAND($modifiers, 1) Then ; ALT
        DllCall("user32.dll", "int", "keybd_event", "int", 0x12, "int", 0, "int", 0, "ptr", 0)
    EndIf
    If BitAND($modifiers, 4) Then ; SHIFT
        DllCall("user32.dll", "int", "keybd_event", "int", 0x10, "int", 0, "int", 0, "ptr", 0)
    EndIf
    If BitAND($modifiers, 8) Then ; WIN
        DllCall("user32.dll", "int", "keybd_event", "int", 0x5B, "int", 0, "int", 0, "ptr", 0)
    EndIf
   
    DllCall("user32.dll", "int", "keybd_event", "int", $vk, "int", 0, "int", 0, "ptr", 0)
    Sleep(20)
    DllCall("user32.dll", "int", "keybd_event", "int", $vk, "int", 0, "int", 2, "ptr", 0)
    
    If BitAND($modifiers, 8) Then ; WIN
        DllCall("user32.dll", "int", "keybd_event", "int", 0x5B, "int", 0, "int", 2, "ptr", 0)
    EndIf
    If BitAND($modifiers, 4) Then ; SHIFT
        DllCall("user32.dll", "int", "keybd_event", "int", 0x10, "int", 0, "int", 2, "ptr", 0)
    EndIf
    If BitAND($modifiers, 1) Then ; ALT
        DllCall("user32.dll", "int", "keybd_event", "int", 0x12, "int", 0, "int", 2, "ptr", 0)
    EndIf
    If BitAND($modifiers, 2) Then ; CTRL
        DllCall("user32.dll", "int", "keybd_event", "int", 0x11, "int", 0, "int", 2, "ptr", 0)
    EndIf
EndFunc