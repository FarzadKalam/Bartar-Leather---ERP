import os
import requests
import sys

API_KEY = os.getenv("GAPGPT_API_KEY")
API_URL = "https://api.gapgpt.app/v1/chat/completions"
MODEL = "qwen2.5-coder"

def read_project():
    files = []
    for root, dirs, filenames in os.walk("."):
        for name in filenames:
            if name.endswith((".py",".js",".ts",".json",".html",".css",".md")):
                path = os.path.join(root, name)
                try:
                    with open(path,"r",encoding="utf8") as f:
                        content = f.read()
                    files.append(f"\nFILE: {path}\n{content}")
                except:
                    pass
    return "\n".join(files)

prompt = " ".join(sys.argv[1:])

context = read_project()

payload = {
    "model": MODEL,
    "messages": [
        {"role":"system","content":"You are a coding assistant. The following is the project."},
        {"role":"user","content": context + "\n\nQUESTION:\n" + prompt}
    ]
}

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type":"application/json"
}

r = requests.post(API_URL, json=payload, headers=headers)

print(r.json()["choices"][0]["message"]["content"])
