import os
import shutil
import json
import re
from typing import Any, Dict


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FILES_DIR = os.path.join(BASE_DIR, 'files')
TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')
QUEUE_STATES_DIR = os.path.join(BASE_DIR, 'queue_states')
HINTS_DIR = os.path.join(BASE_DIR, '..', 'files', 'hints')
PARENT_FILES_DIR = os.path.join(BASE_DIR, '..', 'files')


def safe_write_json(path: str, data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def extract_valid_entries(content: str) -> Dict[str, Any]:
    pattern = r'"(\d+)":\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'
    
    matches = re.finditer(pattern, content, re.DOTALL)
    result = {}
    
    for match in matches:
        chat_id = match.group(1)
        entry_content = match.group(2)
        
        try:
            entry_json = '{' + entry_content + '}'
            entry_data = json.loads(entry_json)
            result[chat_id] = entry_data
        except json.JSONDecodeError:
            try:
                lines = entry_content.split('\n')
                cleaned_lines = []
                for line in lines:
                    line = line.strip()
                    if line and re.match(r'"[^"]+"\s*:\s*.+', line):
                        if not line.endswith(','):
                            line += ','
                        cleaned_lines.append(line)
                
                if cleaned_lines:
                    if cleaned_lines[-1].endswith(','):
                        cleaned_lines[-1] = cleaned_lines[-1][:-1]
                
                cleaned_content = '{' + ''.join(cleaned_lines) + '}'
                entry_data = json.loads(cleaned_content)
                result[chat_id] = entry_data
            except:
                continue
    
    return result


def load_and_fix_json(path: str, default_value: Any) -> Any:
    if not os.path.exists(path):
        return default_value
    
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError:
        pass
    
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if isinstance(default_value, dict) and path.endswith('hints.json'):
            extracted = extract_valid_entries(content)
            if extracted:
                return extracted
        
        if isinstance(default_value, dict) and 'hints' in default_value:
            try:
                hints_match = re.search(r'"hints"\s*:\s*(\[.*?\])', content, re.DOTALL)
                checkbox_match = re.search(r'"checkbox"\s*:\s*"([^"]*)"', content)
                
                hints_list = []
                checkbox_val = ''
                
                if hints_match:
                    try:
                        hints_list = json.loads(hints_match.group(1))
                    except:
                        pass
                
                if checkbox_match:
                    checkbox_val = checkbox_match.group(1)
                
                return {'hints': hints_list, 'checkbox': checkbox_val}
            except:
                pass
        
        return default_value
    except Exception:
        pass
    
    return default_value


def validate_and_fix_hints() -> None:
    os.makedirs(HINTS_DIR, exist_ok=True)
    hints_path = os.path.join(HINTS_DIR, 'hints.json')
    allhints_path = os.path.join(HINTS_DIR, 'allhints.json')

    hints = load_and_fix_json(hints_path, {})
    
    if not isinstance(hints, dict):
        hints = {}
    
    fixed_hints: Dict[str, Any] = {}
    for key, value in hints.items():
        if not isinstance(value, dict):
            continue
        
        fixed_entry = {}
        for k, v in value.items():
            if k == 'checkbox':
                fixed_entry[k] = str(v) if v is not None else ''
            elif k == 'now':
                fixed_entry[k] = bool(v)
            else:
                fixed_entry[k] = v
        
        if 'checkbox' not in fixed_entry:
            fixed_entry['checkbox'] = ''
        if 'now' not in fixed_entry:
            fixed_entry['now'] = False
            
        fixed_hints[str(key)] = fixed_entry
    
    safe_write_json(hints_path, fixed_hints)

    allhints = load_and_fix_json(allhints_path, {'hints': [], 'checkbox': ''})
    
    if not isinstance(allhints, dict):
        allhints = {'hints': [], 'checkbox': ''}
    
    hints_list = allhints.get('hints', [])
    if not isinstance(hints_list, list):
        hints_list = []
    
    checkbox = allhints.get('checkbox', '')
    if not isinstance(checkbox, str):
        checkbox = str(checkbox) if checkbox is not None else ''
    
    safe_write_json(allhints_path, {
        'hints': hints_list,
        'checkbox': checkbox
    })


def reset_queue_state() -> None:
    queue_state_path = os.path.join(FILES_DIR, 'queue_state.json')
    app_state_path = os.path.join(FILES_DIR, 'app_state.json')

    safe_write_json(queue_state_path, {
        'queue_users': [],
        'current_queue_user': 0,
        'queue_user_counter': 0,
        'queue_running': False,
        'queue_status': {'current_user_loaded': False}
    })

    safe_write_json(app_state_path, {
        'queue_mode_enabled': False,
        'auto_delete_enabled': False,
        'auto_send_enabled': False
    })

    if os.path.isdir(TEMPLATES_DIR):
        for name in os.listdir(TEMPLATES_DIR):
            if name.startswith('queue_user_') and name.endswith('.html'):
                try:
                    os.remove(os.path.join(TEMPLATES_DIR, name))
                except FileNotFoundError:
                    pass

    if os.path.isdir(QUEUE_STATES_DIR):
        shutil.rmtree(QUEUE_STATES_DIR, ignore_errors=True)


def reset_files_folder() -> None:
    os.makedirs(FILES_DIR, exist_ok=True)

    blanks: Dict[str, Any] = {
        'posts.txt': '',
        'tags.txt': '',
        'sendInfo.json': '',
        'send_result.json': {"success": None, "message": ""},
        'send_request_status.json': {"pending_request": False},
        'processed_media_hashes.json': [],
        'autoload.json': '',
    }

    for filename, content in blanks.items():
        path = os.path.join(FILES_DIR, filename)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if isinstance(content, str):
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
        else:
            safe_write_json(path, content)


def reset_splash_html() -> None:
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    splash = """<!DOCTYPE html>
<html>
<head>
    <title>OF HELPER by @yen_ofsfs</title>
    <link rel=\"icon\" type=\"image/png\" href=\"https://i.imgur.com/HBhjTHT.png\">
    <style>
        body { background-color: black; color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; font-size: 2em; font-family: Arial, sans-serif; overflow: hidden; }
        .container { position: relative; max-width: 80vw; }
        .logo { width: 100%; height: auto; display: flex; justify-content: center; align-items: center; position: relative; border-radius: 16px; overflow: visible; aspect-ratio: 1/1; }
        .logo img { max-width: 100%; max-height: 100%; object-fit: contain; position: relative; z-index: 2; }
        .candle-glow { position: absolute; top: 50%; left: 10%; transform: translate(-50%, -50%); width: 120%; height: 120%; background: radial-gradient(circle at 30% 40%, rgba(255, 147, 41, 0.3) 0%, rgba(255, 147, 41, 0.2) 20%, rgba(255, 147, 41, 0.1) 40%, rgba(255, 147, 41, 0.05) 60%, transparent 70%); filter: blur(30px); animation: flicker 4s infinite alternate; z-index: 1; }
        .glow-overlay { position: absolute; top: 50%; left: 20%; transform: translate(-50%, -50%); width: 70%; height: 110%; background: radial-gradient(circle at center, rgba(255, 183, 77, 0.6) 0%, rgba(255, 183, 77, 0.3) 30%, rgba(255, 183, 77, 0.1) 60%, transparent 80%); filter: blur(20px); animation: flicker 4s infinite alternate; z-index: 3; mix-blend-mode: screen; }
        @keyframes flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } 25%, 75% { opacity: 0.8; } 35%, 65% { opacity: 0.9; } }
        .vignette { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.8) 100%); pointer-events: none; z-index: 4; }
    </style>
    <meta http-equiv=\"Cache-Control\" content=\"no-store, no-cache, must-revalidate, max-age=0\"/>
    <meta http-equiv=\"Pragma\" content=\"no-cache\"/>
    <meta http-equiv=\"Expires\" content=\"0\"/>
    <meta http-equiv=\"refresh\" content=\"0;url=/\" />
</head>
<body>
    <div class=\"vignette\"></div>
    <div class=\"container\"> 
        <div class=\"logo\"> 
            <div class=\"candle-glow\"></div> 
            <img src=\"https://i.imgur.com/A2orTGN.gif\" alt=\"Animation\"> 
            <div class=\"glow-overlay\"></div> 
        </div>
    </div>
</body>
</html>
"""
    out = os.path.join(TEMPLATES_DIR, 'output.html')
    tmp = out + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(splash)
    os.replace(tmp, out)


def reset_external_data_files() -> None:
    data_dir = os.path.abspath(os.path.join(PARENT_FILES_DIR, 'data'))
    os.makedirs(data_dir, exist_ok=True)

    data_json_path = os.path.join(data_dir, 'data.json')
    session_json_path = os.path.join(data_dir, 'session.json')

    tmp = data_json_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump([], f, ensure_ascii=False, indent=2)
    os.replace(tmp, data_json_path)

    tmp = session_json_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump([], f, ensure_ascii=False, indent=2)
    os.replace(tmp, session_json_path)


def main() -> None:
    reset_queue_state()
    reset_files_folder()
    validate_and_fix_hints()
    reset_splash_html()
    reset_external_data_files()
    print('State reset complete.')


if __name__ == '__main__':
    main()