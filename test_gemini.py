from openai import OpenAI

client = OpenAI(
    api_key="AQ.Ab8RN6LM8fz3pdvEefSddymXhpvnTzH_neM7krjq-V8-FzgqgA",
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
)
r = client.chat.completions.create(
    model="gemini-3.5-flash",   # <-- remplace par le nom exact vu dans la liste
    messages=[{"role": "user",
               "content": "Dis bonjour en une phrase en français, puis une phrase en arabe."}],
)
print(r.choices[0].message.content)