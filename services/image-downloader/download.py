import os
import time
import requests

IMAGES_DIR = os.getenv("IMAGES_DIR", "/images")
os.makedirs(IMAGES_DIR, exist_ok=True)

IMAGES = [
    (f"img_{i+1:03d}.jpg", kw) for i, kw in enumerate([
        "beach,sunset,ocean",
        "city,night,lights",
        "mountain,hiking,landscape",
        "coffee,cafe,morning",
        "dog,park,playing",
        "wedding,romantic,ceremony",
        "storm,lightning,dramatic",
        "children,laughing,joy",
        "architecture,historic,europe",
        "forest,path,nature",
        "snow,winter,landscape",
        "flowers,garden,colorful",
        "food,market,fresh",
        "running,sport,athlete",
        "ocean,waves,sea",
        "autumn,leaves,forest",
        "neon,lights,city,night",
        "desert,sand,dunes",
        "waterfall,nature,water",
        "dinner,candles,romantic,table",
        "cat,window,sunlight",
        "sushi,japanese,food",
        "yoga,sunrise,meditation",
        "bicycle,city,street",
        "campfire,night,stars",
        "portrait,smile,face",
        "piano,music,hands",
        "rain,street,umbrella",
        "skyscraper,glass,architecture",
        "vineyard,wine,sunset",
        "baby,hands,tiny",
        "surfer,wave,ocean",
        "library,books,reading",
        "balloon,sky,colorful",
        "graffiti,street,art,colorful",
        "farmer,field,harvest",
        "aurora,northern,lights,sky",
        "boxing,gym,sport,fighter",
        "jazz,music,band,concert",
        "lake,reflection,calm,nature",
        "pizza,oven,italian,food",
        "cliff,edge,dramatic,landscape",
        "couple,love,embrace,romance",
        "spices,market,colorful,herbs",
        "wolf,wild,forest,animal",
        "glass,modern,building,reflection",
        "monk,temple,asia,spiritual",
        "ice,skating,winter,sport",
        "rooftop,party,night,celebration",
        "mist,fog,mountain,morning",
    ])
]

def download(filename, keywords):
    path = os.path.join(IMAGES_DIR, filename)
    if os.path.exists(path):
        print(f"  skip  {filename} (already exists)", flush=True)
        return True
    url = f"https://loremflickr.com/800/600/{keywords}"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)
        print(f"  ok    {filename}", flush=True)
        time.sleep(0.3)
        return True
    except Exception as e:
        print(f"  fail  {filename}: {e}", flush=True)
        return False

if __name__ == "__main__":
    print(f"Downloading {len(IMAGES)} images to {IMAGES_DIR}/\n", flush=True)
    results = [download(fn, kw) for fn, kw in IMAGES]
    ok = sum(results)
    print(f"\n{ok}/{len(IMAGES)} images ready.", flush=True)
    if ok < len(IMAGES):
        exit(1)
