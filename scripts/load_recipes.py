"""
Loads 60 diverse recipes into the search-arena ingestion service.
Run with: python scripts/load_recipes.py
"""

import json
import urllib.request

INGESTION_URL = "http://localhost:8004"

RECIPES = [
    # --- Hangover / morning after ---
    {"id": "1",  "title": "Bloody Mary",          "cuisine": "Cocktail",   "text": "Spicy tomato juice cocktail with vodka, tabasco, worcestershire, celery salt and a celery stick. The ultimate morning-after remedy for rough nights."},
    {"id": "2",  "title": "Hangover Sandwich",     "cuisine": "American",   "text": "Greasy bacon, egg and melted cheddar on a toasted brioche bun with hot sauce. Exactly what you need after a heavy night out."},
    {"id": "3",  "title": "Pho Bo",                "cuisine": "Vietnamese", "text": "Rich, slow-simmered beef bone broth with rice noodles, fresh herbs, bean sprouts, lime and chili. A restorative bowl that brings you back to life."},
    {"id": "4",  "title": "Shakshuka",             "cuisine": "Middle East","text": "Eggs poached in a spiced tomato and pepper sauce with cumin and paprika. A bold, warming dish perfect for a slow Sunday morning."},
    {"id": "5",  "title": "Miso Soup",             "cuisine": "Japanese",   "text": "Soothing dashi broth with white miso, silken tofu, wakame and green onion. Gentle and restorative, great for upset stomachs."},

    # --- Sick / cold / sore throat ---
    {"id": "6",  "title": "Chicken Noodle Soup",   "cuisine": "Comfort",   "text": "Classic slow-cooked chicken broth with egg noodles, carrots and celery. The definitive remedy when you feel under the weather."},
    {"id": "7",  "title": "Healing Ginger Tea",    "cuisine": "Drink",     "text": "Fresh ginger steeped with lemon juice, raw honey and a pinch of cayenne. A powerful tonic that soothes a sore throat and clears congestion."},
    {"id": "8",  "title": "Golden Milk Latte",     "cuisine": "Drink",     "text": "Warm oat milk blended with turmeric, black pepper, cinnamon and honey. Anti-inflammatory and deeply soothing when you feel run down."},
    {"id": "9",  "title": "Bone Broth",            "cuisine": "Wellness",  "text": "24-hour simmered beef and marrow bones with garlic and herbs. Gut-healing, rich in collagen, the foundation of getting well again."},
    {"id": "10", "title": "Garlic Honey Toast",    "cuisine": "Comfort",   "text": "Toasted sourdough rubbed with raw garlic and drizzled with wildflower honey. Simple, antimicrobial, and strangely comforting when ill."},

    # --- Romantic dinner ---
    {"id": "11", "title": "Beef Tenderloin",       "cuisine": "French",    "text": "Pan-seared filet mignon with a red wine reduction, roasted shallots and truffle butter. The quintessential dish for an intimate dinner for two."},
    {"id": "12", "title": "Lobster Thermidor",     "cuisine": "French",    "text": "Lobster halves baked in a creamy cognac and mustard sauce, gratinéed under the broiler. Show-stopping, indulgent and undeniably romantic."},
    {"id": "13", "title": "Chocolate Lava Cake",   "cuisine": "Dessert",   "text": "Warm bittersweet chocolate cake with a molten center, served with vanilla bean ice cream. The perfect ending to a candlelit evening."},
    {"id": "14", "title": "Oysters Rockefeller",   "cuisine": "American",  "text": "Fresh oysters baked with spinach, parmesan and herb breadcrumbs. Elegant, luxurious and the perfect seduction starter."},
    {"id": "15", "title": "Raspberry Tiramisu",    "cuisine": "Dessert",   "text": "Layers of espresso-soaked ladyfingers, mascarpone cream and fresh raspberries. Light, luscious and made to share."},

    # --- Quick / weeknight ---
    {"id": "16", "title": "Aglio e Olio",          "cuisine": "Italian",   "text": "Spaghetti tossed with golden garlic, olive oil, chili flakes and parsley. Ready in 15 minutes, tastes like a trattoria."},
    {"id": "17", "title": "Sheet Pan Chicken",     "cuisine": "American",  "text": "Chicken thighs roasted on one pan with lemon, garlic and whatever vegetables you have. Minimal prep, minimal dishes."},
    {"id": "18", "title": "Egg Fried Rice",        "cuisine": "Chinese",   "text": "Day-old rice stir-fried with eggs, soy sauce, sesame oil and scallions. The fastest dinner from fridge leftovers."},
    {"id": "19", "title": "Black Bean Tacos",      "cuisine": "Mexican",   "text": "Crispy corn tortillas filled with spiced black beans, avocado, pickled onion and lime crema. On the table in 20 minutes."},
    {"id": "20", "title": "Caprese Salad",         "cuisine": "Italian",   "text": "Thick sliced heirloom tomatoes, fresh buffalo mozzarella, basil leaves and aged balsamic. Zero cooking, maximum flavor."},

    # --- Healthy / light ---
    {"id": "21", "title": "Buddha Bowl",           "cuisine": "Vegan",     "text": "Quinoa base topped with roasted chickpeas, shredded kale, avocado, pickled beets and tahini dressing. Nourishing and colorful."},
    {"id": "22", "title": "Green Smoothie",        "cuisine": "Drink",     "text": "Spinach, frozen mango, banana, coconut water and chia seeds blended smooth. Packed with micronutrients without tasting like a salad."},
    {"id": "23", "title": "Grilled Salmon",        "cuisine": "Seafood",   "text": "Salmon fillet with lemon zest, dill and a light olive oil glaze, grilled to perfection. High-protein, rich in omega-3 fatty acids."},
    {"id": "24", "title": "Zucchini Noodles",      "cuisine": "Low-Carb",  "text": "Spiralized zucchini with cherry tomatoes, basil and pine nuts in a light garlic sauce. All the satisfaction of pasta without the carbs."},
    {"id": "25", "title": "Acai Bowl",             "cuisine": "Brunch",    "text": "Thick blended acai with frozen berries and almond milk, topped with granola, banana slices and honey. Vibrant and energizing."},

    # --- Comfort / indulgent ---
    {"id": "26", "title": "Mac and Cheese",        "cuisine": "American",  "text": "Elbow pasta baked in a triple-cheese bechamel with a golden panko crust. Pure, unapologetic comfort in a dish."},
    {"id": "27", "title": "French Onion Soup",     "cuisine": "French",    "text": "Caramelized onions simmered in beef broth with thyme, topped with a crouton buried under molten gruyere. Rich, sweet and deeply satisfying."},
    {"id": "28", "title": "Butter Chicken",        "cuisine": "Indian",    "text": "Tender chicken in a velvety tomato-cream sauce fragrant with garam masala, ginger and fenugreek. The ultimate warming curry."},
    {"id": "29", "title": "Banana Bread",          "cuisine": "Baking",    "text": "Moist, dense loaf made with very ripe bananas, brown butter and a hint of cinnamon. Nostalgic, warm and impossible to resist."},
    {"id": "30", "title": "Clam Chowder",          "cuisine": "American",  "text": "Thick, creamy New England soup with clams, potatoes, bacon and thyme. A bowl of pure coastal comfort on a cold day."},

    # --- Spicy / bold ---
    {"id": "31", "title": "Nashville Hot Chicken", "cuisine": "American",  "text": "Double-fried chicken coated in a fiery cayenne paste and served on white bread with pickles. A punishing but addictive heat experience."},
    {"id": "32", "title": "Dan Dan Noodles",       "cuisine": "Sichuan",   "text": "Chewy wheat noodles in a numbing sesame-chili oil sauce with pork mince and preserved vegetables. Bold, complex and lip-tingling."},
    {"id": "33", "title": "Kimchi Jjigae",         "cuisine": "Korean",    "text": "Deeply fermented kimchi simmered with pork belly and tofu in a spicy, funky broth. A punchy, soul-warming Korean staple."},
    {"id": "34", "title": "Habanero Salsa",        "cuisine": "Mexican",   "text": "Roasted habanero peppers blended with tomato, garlic and lime. A seriously hot salsa that will make your eyes water."},
    {"id": "35", "title": "Mapo Tofu",             "cuisine": "Sichuan",   "text": "Silken tofu in a fiery, numbing sauce of doubanjiang, fermented black beans and Sichuan peppercorns. An electrifying experience for the palate."},

    # --- Summer / refreshing ---
    {"id": "36", "title": "Watermelon Gazpacho",   "cuisine": "Spanish",   "text": "Chilled watermelon blended with cucumber, mint, lime juice and a splash of white balsamic. Shockingly refreshing on a sweltering day."},
    {"id": "37", "title": "Mango Sorbet",          "cuisine": "Dessert",   "text": "Just frozen mango pulp churned with lime juice and a pinch of salt. Pure tropical sunshine in frozen form."},
    {"id": "38", "title": "Panzanella",            "cuisine": "Italian",   "text": "Torn stale bread soaked in tomato juices with basil, red onion and capers. Rustically perfect for peak summer tomatoes."},
    {"id": "39", "title": "Lemonade",              "cuisine": "Drink",     "text": "Fresh-squeezed lemons with cane sugar and ice-cold sparkling water. The most honest and refreshing drink on a hot afternoon."},
    {"id": "40", "title": "Ceviche",               "cuisine": "Peruvian",  "text": "Raw sea bass cured in lime juice with red onion, cilantro and aji amarillo. Bright, acidic and utterly cooling."},

    # --- Winter / cozy ---
    {"id": "41", "title": "Mulled Wine",           "cuisine": "Drink",     "text": "Red wine gently simmered with cinnamon sticks, star anise, orange peel and cloves. The scent alone feels like a warm fireplace."},
    {"id": "42", "title": "Beef Stew",             "cuisine": "Comfort",   "text": "Slow-braised beef chuck with root vegetables and red wine in a thick, unctuous gravy. The smell fills the house for hours."},
    {"id": "43", "title": "Hot Chocolate",         "cuisine": "Drink",     "text": "Dark chocolate melted into steamed whole milk with a pinch of cinnamon and salt. Rich, velvety and made for cold evenings."},
    {"id": "44", "title": "Lentil Soup",           "cuisine": "Middle East","text": "Red lentils cooked with cumin-fried onions, lemon and smoked paprika. Deeply nourishing, earthy and perfect when it rains."},
    {"id": "45", "title": "Cottage Pie",           "cuisine": "British",   "text": "Minced beef in a rich gravy topped with fluffy mashed potato and baked until golden. A British winter hug in a dish."},

    # --- Vegetarian / vegan ---
    {"id": "46", "title": "Mushroom Risotto",      "cuisine": "Italian",   "text": "Arborio rice slowly coaxed with porcini mushroom stock, white wine and a generous handful of parmesan. Earthy and deeply savory."},
    {"id": "47", "title": "Falafel Wrap",          "cuisine": "Middle East","text": "Crispy chickpea fritters with tahini, cucumber, tomato and pickles in a soft pita. Street food perfection."},
    {"id": "48", "title": "Vegan Ramen",           "cuisine": "Japanese",  "text": "Kombu and shiitake mushroom dashi with miso tare, corn, bok choy and nori. Complex, warming and entirely plant-based."},
    {"id": "49", "title": "Eggplant Parmesan",     "cuisine": "Italian",   "text": "Breaded and fried eggplant layered with marinara and mozzarella, baked until bubbling. Hearty enough to forget about meat."},
    {"id": "50", "title": "Jackfruit Tacos",       "cuisine": "Vegan",     "text": "Braised young jackfruit seasoned like pulled pork, served in warm tortillas with avocado and slaw. Convincingly meaty."},

    # --- Brunch ---
    {"id": "51", "title": "Eggs Benedict",         "cuisine": "Brunch",    "text": "Poached eggs and Canadian bacon on an English muffin, blanketed in silky hollandaise. The undisputed king of brunch."},
    {"id": "52", "title": "Fluffy Pancakes",       "cuisine": "Brunch",    "text": "Thick, airy buttermilk pancakes with maple syrup and fresh blueberries. Weekend mornings done right."},
    {"id": "53", "title": "Avocado Toast",         "cuisine": "Brunch",    "text": "Sourdough spread with smashed avocado, poached egg, chili flakes and lemon zest. The millennial classic that earned its reputation."},
    {"id": "54", "title": "Croque Monsieur",       "cuisine": "French",    "text": "Toasted ham and gruyere sandwich smothered in béchamel and broiled until bubbling. Parisian café at its most satisfying."},
    {"id": "55", "title": "Granola Parfait",       "cuisine": "Brunch",    "text": "Layered greek yogurt, house-made honey granola and seasonal berries. Light, crunchy and perfect for a gentle morning."},

    # --- International / street food ---
    {"id": "56", "title": "Pad Thai",              "cuisine": "Thai",      "text": "Rice noodles wok-tossed with shrimp, egg, bean sprouts, tamarind and crushed peanuts. The iconic Thai street noodle that everyone loves."},
    {"id": "57", "title": "Lamb Kofta",            "cuisine": "Middle East","text": "Spiced minced lamb skewers grilled over charcoal, served with tzatziki and flatbread. Smoky, fragrant and deeply satisfying."},
    {"id": "58", "title": "Banh Mi",               "cuisine": "Vietnamese","text": "Crispy baguette with pork belly, pickled daikon and carrot, cilantro, jalapeño and mayo. The greatest sandwich in the world, arguably."},
    {"id": "59", "title": "Jerk Chicken",          "cuisine": "Caribbean", "text": "Chicken marinated in scotch bonnets, allspice and thyme, slow-grilled over pimento wood. Fiery, fragrant and unlike anything else."},
    {"id": "60", "title": "Roti Canai",            "cuisine": "Malaysian", "text": "Flaky layered flatbread cooked on a griddle, served with dal curry for dipping. Hypnotically satisfying street food."},
]


def build_payload():
    return {
        "collection": "recipes",
        "documents": [
            {
                "id": r["id"],
                "text": r["text"],
                "metadata": {"title": r["title"], "cuisine": r["cuisine"]},
            }
            for r in RECIPES
        ],
    }


def main():
    payload = build_payload()
    data = json.dumps(payload).encode("utf-8")
    print(f"Sending {len(RECIPES)} recipes to ingestion service...")
    req = urllib.request.Request(
        f"{INGESTION_URL}/ingest",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read())
        print(f"Status: {resp.status}")
        print(body)


if __name__ == "__main__":
    main()
