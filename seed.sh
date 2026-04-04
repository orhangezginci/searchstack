#!/bin/sh
set -e

echo "Seeding 20 recipes..."

curl -sf -X POST http://ingestion-service:8004/ingest \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "collection": "recipes",
  "documents": [
    {
      "id": "recipe-001",
      "text": "Bloody Mary: A cocktail made with vodka, tomato juice, Worcestershire sauce, Tabasco hot sauce, lemon juice, celery salt, and black pepper. Served over ice with a celery stalk. A staple of American brunch culture, long celebrated as a morning-after restorative drink.",
      "metadata": { "title": "Bloody Mary", "cuisine": "American" }
    },
    {
      "id": "recipe-002",
      "text": "Pho Bo: Vietnamese soup of beef bone broth simmered for hours with star anise, cinnamon, cloves, and ginger. Served with rice noodles, thinly sliced beef, fresh herbs, bean sprouts, lime, and chili. Vietnam's national dish, eaten at all hours but particularly known as a morning and restorative meal.",
      "metadata": { "title": "Pho Bo", "cuisine": "Vietnamese" }
    },
    {
      "id": "recipe-003",
      "text": "Honey Ginger Lemon Tea: Hot water with freshly grated ginger root, raw honey, and lemon juice. Steeped for five minutes and served warm. A traditional home remedy found across many cultures, used for generations to soothe throat inflammation and support recovery.",
      "metadata": { "title": "Honey Ginger Lemon Tea", "cuisine": "Herbal" }
    },
    {
      "id": "recipe-004",
      "text": "Chicken Noodle Soup: Slow-simmered chicken broth with shredded chicken breast, egg noodles, carrots, celery, onion, bay leaf, thyme, and parsley. Long considered the quintessential comfort food in Western culture, traditionally associated with care and recovery from illness.",
      "metadata": { "title": "Chicken Noodle Soup", "cuisine": "American" }
    },
    {
      "id": "recipe-005",
      "text": "Gazpacho: Cold raw blended soup of ripe tomatoes, cucumber, red bell pepper, garlic, red onion, olive oil, sherry vinegar, and bread. Served chilled. A traditional Andalusian summer dish, eaten as a refreshing starter during the hottest months of the year.",
      "metadata": { "title": "Gazpacho", "cuisine": "Spanish" }
    },
    {
      "id": "recipe-006",
      "text": "Watermelon Mint Salad: Fresh watermelon cubes tossed with torn mint leaves, crumbled feta cheese, lime juice, and a drizzle of olive oil. A popular dish in Mediterranean and Middle Eastern cuisines, typically served during hot months as a cooling, hydrating appetizer.",
      "metadata": { "title": "Watermelon Mint Salad", "cuisine": "Modern" }
    },
    {
      "id": "recipe-007",
      "text": "Greek Salad: Tomatoes, cucumber, Kalamata olives, red onion, and feta cheese dressed with extra virgin olive oil, dried oregano, and salt. A staple of the Mediterranean diet, associated globally with light summer eating.",
      "metadata": { "title": "Greek Salad", "cuisine": "Greek" }
    },
    {
      "id": "recipe-008",
      "text": "Beef Wellington: Beef tenderloin fillet seared, coated in mushroom duxelles and Dijon mustard, wrapped in prosciutto and puff pastry, then baked until golden. Considered one of the most technically demanding dishes in classical British cuisine, traditionally reserved for formal dinners and celebratory occasions.",
      "metadata": { "title": "Beef Wellington", "cuisine": "British" }
    },
    {
      "id": "recipe-009",
      "text": "Lobster Bisque: Cream soup made from lobster shells and meat, cognac, shallots, garlic, tomato paste, heavy cream, and tarragon. Strained until silky smooth. A classic of haute cuisine French cooking, long associated with upscale restaurant dining and celebratory meals.",
      "metadata": { "title": "Lobster Bisque", "cuisine": "French" }
    },
    {
      "id": "recipe-010",
      "text": "Chocolate Lava Cake: Individual dark chocolate cake made with butter, eggs, sugar, flour, and melted chocolate. Baked briefly so the center remains liquid and molten. A restaurant dessert staple since the 1990s, widely associated with special occasion dining.",
      "metadata": { "title": "Chocolate Lava Cake", "cuisine": "French" }
    },
    {
      "id": "recipe-011",
      "text": "Chicken Vindaloo: Goan curry of chicken marinated in vinegar, garlic, ginger, and a paste of dried Kashmiri chilies, cumin, coriander, turmeric, and cloves. Cooked until the sauce reduces. One of the hottest dishes in Indian cuisine, known internationally for its aggressive chili heat.",
      "metadata": { "title": "Chicken Vindaloo", "cuisine": "Indian" }
    },
    {
      "id": "recipe-012",
      "text": "Kimchi Jjigae: Korean stew of aged kimchi, pork belly, tofu, gochugaru, garlic, sesame oil, and anchovy broth. Simmered until the kimchi breaks down. One of the most beloved everyday dishes in Korean cuisine, known for its deeply pungent and fermented heat.",
      "metadata": { "title": "Kimchi Jjigae", "cuisine": "Korean" }
    },
    {
      "id": "recipe-013",
      "text": "Szechuan Mapo Tofu: Silken tofu in a sauce of doubanjiang, fermented black beans, ground pork, garlic, ginger, chicken broth, and Szechuan peppercorns. Finished with chili oil. A defining dish of Szechuan cuisine, renowned for its intense combination of numbing and fiery heat.",
      "metadata": { "title": "Szechuan Mapo Tofu", "cuisine": "Chinese" }
    },
    {
      "id": "recipe-014",
      "text": "Mulled Wine: Red wine heated with cinnamon sticks, cloves, star anise, cardamom, orange peel, and honey. Simmered low and slow and served hot. A traditional drink across Northern and Central Europe, closely associated with Christmas markets and cold-weather gatherings.",
      "metadata": { "title": "Mulled Wine", "cuisine": "European" }
    },
    {
      "id": "recipe-015",
      "text": "Hot Toddy: Whiskey combined with hot water, fresh lemon juice, honey, and a cinnamon stick. Served in a mug. A traditional Scottish drink with a long history as a cold-weather nightcap and remedy, particularly popular in winter.",
      "metadata": { "title": "Hot Toddy", "cuisine": "Scottish" }
    },
    {
      "id": "recipe-016",
      "text": "Chai Latte: Black tea brewed with cardamom pods, cinnamon, fresh ginger, cloves, and black pepper. Strained and combined with steamed whole milk and honey. Rooted in Indian chai tradition, now a globally popular warming drink associated with autumn and winter.",
      "metadata": { "title": "Chai Latte", "cuisine": "Indian" }
    },
    {
      "id": "recipe-017",
      "text": "Spaghetti Carbonara: Spaghetti tossed with a sauce of egg yolks, Pecorino Romano, guanciale, and cracked black pepper. No cream added. One of the four canonical pasta dishes of Roman cuisine, prized for its richness achieved through technique alone.",
      "metadata": { "title": "Spaghetti Carbonara", "cuisine": "Italian" }
    },
    {
      "id": "recipe-018",
      "text": "Pad Thai: Rice noodles stir-fried with shrimp, tofu, eggs, bean sprouts, and green onion in a sauce of tamarind, fish sauce, and palm sugar. Topped with crushed peanuts and lime. Promoted as Thailand's national dish in the 1940s and now one of the most recognised dishes in international Thai cuisine.",
      "metadata": { "title": "Pad Thai", "cuisine": "Thai" }
    },
    {
      "id": "recipe-019",
      "text": "Tiramisu: Ladyfinger biscuits soaked in espresso and layered with a mixture of mascarpone, egg yolks, sugar, and whipped cream. Dusted with bitter cocoa powder and refrigerated overnight. One of Italy's most exported desserts, a fixture of Italian restaurant menus worldwide since the 1980s.",
      "metadata": { "title": "Tiramisu", "cuisine": "Italian" }
    },
    {
      "id": "recipe-020",
      "text": "Eggs Benedict: Toasted English muffin topped with Canadian bacon and a poached egg, covered in hollandaise sauce made from egg yolks, butter, and lemon juice. A cornerstone of American brunch culture, associated with leisurely weekend mornings.",
      "metadata": { "title": "Eggs Benedict", "cuisine": "American" }
    }
  ]
}
EOF

echo "Done! 20 recipes seeded into the recipes collection."
