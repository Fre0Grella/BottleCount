"""
store.py — Single data access layer.
Currently uses local JSON files.
To switch to Supabase, rewrite only this file — everything else stays identical.
"""
import json, os

BASE     = os.path.join(os.path.dirname(__file__), "data")
CAT_PATH = os.path.join(BASE, "catalog.json")
SET_PATH = os.path.join(BASE, "settings.json")

def _load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def _save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def get_catalog():   return _load(CAT_PATH)
def save_catalog(d): _save(CAT_PATH, d)
def get_settings():  return _load(SET_PATH)
def save_settings(d):_save(SET_PATH, d)
