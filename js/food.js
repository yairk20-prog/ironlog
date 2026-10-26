/* ==========================================================================
   food.js — the offline food database, its search, and the Hebrew parser.

   Every food is stored per 100 g, the way a package label states it, so a
   portion is always just "how many grams" — a unit, a cup or a spoon is a
   gram weight on the side. That one rule is what lets the search sheet, the
   saved-foods list and the free-text parser all compute the same numbers.

   The AI path (photo, free text, unknown foods) refines this when a key is
   set, but the app has to stay useful with the phone in airplane mode.
   ========================================================================== */

/* Each row: [cat, name, aliases ('|'-separated), kcal, protein, carbs, fat, opts]
   — macros per 100 g (or 100 ml for drinks).
   opts: g  = weight of one natural unit, ul = what that unit is called
         d  = a normal portion in grams, when the food has no natural unit
         u  = extra household measures, { label: grams }
         ml = measured by volume (drinks are, by category)
   Sources: USDA FoodData Central and Israeli package labels, rounded. */
const ROWS = [
  /* ---- protein ---- */
  ['protein', 'ביצה', 'ביצים|ביצה קשה|ביצה רכה|ביצה עלומה', 142, 11.5, 1.1, 9.6, { g: 55, ul: 'ביצה' }],
  ['protein', 'חביתה', 'חביתות|ביצה מקושקשת|ביצים מקושקשות|חביתה משתי ביצים', 182, 11, 1, 15, { g: 120, ul: 'חביתה' }],
  ['protein', 'חלבון ביצה', 'חלבון בלבן|חלבונים', 52, 10.9, 0.7, 0.2, { g: 33, ul: 'חלבון' }],
  ['protein', 'סקופ אבקת חלבון', 'אבקת חלבון|שייק חלבון|סקופ|סקופ חלבון|ווי|whey|חלבון מי גבינה', 400, 80, 8.3, 5, { g: 30, ul: 'סקופ' }],
  ['protein', 'חזה עוף', 'עוף|חזה עוף צלוי|חזה עוף בגריל|פרגית חזה', 165, 31, 0, 3.6, { d: 150 }],
  ['protein', 'ירך עוף', 'שוקיים|פרגית|פרגיות|ירכיים', 209, 26, 0, 11, { d: 150 }],
  ['protein', 'כנפיים', 'כנפי עוף|כנף', 254, 24, 0, 17, { d: 150 }],
  ['protein', 'שניצל', 'שניצל עוף|שניצלים', 260, 18, 13, 15, { g: 120, ul: 'שניצל' }],
  ['protein', 'נקניקייה', 'נקניקיה|נקניקיות|נקניקייה עוף', 230, 12, 4, 19, { g: 50, ul: 'נקניקייה' }],
  ['protein', 'פסטרמה', 'פסטרמה הודו|נקניק הודו|פסטרמה עוף', 110, 18, 3, 2.5, { g: 10, ul: 'פרוסה' }],
  ['protein', 'הודו', 'חזה הודו|שניצל הודו|שווארמה הודו', 135, 29, 0, 1.7, { d: 150 }],
  ['protein', 'כבד עוף', 'כבדים|כבד', 167, 24, 1, 6.5, { d: 120 }],
  ['protein', 'בשר בקר', 'בקר|בשר|צלי|בשר צלוי', 250, 26, 0, 17, { d: 150 }],
  ['protein', 'אנטריקוט', 'סטייק|סטייק אנטריקוט|ריב איי', 290, 24, 0, 22, { d: 200 }],
  ['protein', 'פילה בקר', 'פילה|סינטה|סטייק סינטה', 220, 29, 0, 11, { d: 200 }],
  ['protein', 'בשר טחון', 'טחון|בשר טחון מבושל', 254, 26, 0, 17, { d: 150 }],
  ['protein', 'קציצות בשר', 'קציצות|קציצה|כדורי בשר', 220, 16, 8, 14, { g: 40, ul: 'קציצה' }],
  ['protein', 'קבב', 'קבבים|כבב', 250, 17, 4, 19, { g: 60, ul: 'קבב' }],
  ['protein', 'כבש', 'טלה|צלעות טלה|בשר כבש', 294, 25, 0, 21, { d: 150 }],
  ['protein', 'סלמון', 'סלומון|פילה סלמון', 208, 20, 0, 13, { d: 150 }],
  ['protein', 'טונה במים', 'טונה|קופסת טונה', 116, 26, 0, 1, { d: 112, u: { 'קופסה': 112 } }],
  ['protein', 'טונה בשמן', '', 198, 29, 0, 8, { d: 112, u: { 'קופסה': 112 } }],
  ['protein', 'דג לבן', 'דג|דגים|דניס|מושט|לברק|בורי|הייק|קוד|אמנון', 120, 22, 0, 3, { d: 150 }],
  ['protein', 'סרדינים', 'סרדינים בשמן', 208, 25, 0, 11, { d: 90 }],
  ['protein', 'שרימפס', 'חסילונים', 99, 24, 0.2, 0.3, { d: 120 }],
  ['protein', 'טופו', '', 76, 8, 1.9, 4.8, { d: 150 }],
  ['protein', 'אדממה', 'אדמאמה|פולי סויה', 121, 12, 9, 5, { d: 100, u: { 'כוס': 155 } }],
  ['protein', 'חטיף חלבון', 'חלבון בר|פרוטאין בר|חטיף פרוטאין', 333, 33, 33, 10, { g: 60, ul: 'חטיף' }],
  ['protein', 'יוגורט חלבון', 'יוגורט PRO|יופרו|יוגורט 20 גרם חלבון', 72, 10, 5.5, 1.1, { g: 200, ul: 'גביע' }],
  ['protein', 'מעדן חלבון', 'פודינג חלבון|מעדן PRO', 86, 10, 8, 1.5, { g: 200, ul: 'גביע' }],
  ['protein', 'שקשוקה', 'שקשוקה עם ביצים', 95, 6, 5, 6, { d: 300, u: { 'מחבת קטנה': 300 } }],

  /* ---- dairy ---- */
  ['dairy', 'קוטג׳ 5%', 'קוטג|קוטג׳|קוטג׳ 5|גבינת קוטג׳', 103, 11, 3.5, 5, { d: 250, u: { 'גביע': 250, 'כף': 25 } }],
  ['dairy', 'קוטג׳ 3%', 'קוטג׳ 3|קוטג 3', 79, 11, 2, 3, { d: 250, u: { 'גביע': 250, 'כף': 25 } }],
  ['dairy', 'גבינה לבנה 5%', 'גבינה לבנה|לבנה 5', 92, 9, 3.8, 5, { d: 100, u: { 'גביע': 250, 'כף': 25 } }],
  ['dairy', 'גבינה צהובה', 'גבינה|גבינה צהובה 28%|עמק|גאודה|אדם', 350, 25, 1.3, 27, { d: 40, u: { 'פרוסה': 20 } }],
  ['dairy', 'גבינה צהובה 9%', 'גבינה צהובה לייט|עמק 9|גבינה צהובה דלה', 215, 31, 1, 9, { d: 40, u: { 'פרוסה': 20 } }],
  ['dairy', 'בולגרית 5%', 'בולגרית|גבינה בולגרית|צפתית', 118, 16, 1, 5.5, { d: 50 }],
  ['dairy', 'בולגרית 16%', '', 205, 14, 1, 16, { d: 50 }],
  ['dairy', 'פטה', 'גבינת פטה', 264, 14, 4, 21, { d: 50 }],
  ['dairy', 'מוצרלה', 'גבינת מוצרלה', 254, 24, 3, 16, { d: 50 }],
  ['dairy', 'פרמזן', 'פרמג׳ן|גבינה מגוררת', 431, 38, 4, 29, { d: 15, u: { 'כף': 5 } }],
  ['dairy', 'גבינת שמנת', 'פילדלפיה|גבינת שמנת 30%|נפוליאון', 310, 7, 3, 30, { d: 30, u: { 'כף': 20 } }],
  ['dairy', 'לבנה', 'לאבנה|לבנה 9%', 150, 6, 4, 12, { d: 50, u: { 'כף': 20 } }],
  ['dairy', 'שמנת חמוצה', 'שמנת חמוצה 15%', 162, 3, 4, 15, { d: 30, u: { 'כף': 15 } }],
  ['dairy', 'שמנת מתוקה', 'שמנת לבישול|שמנת מתוקה 32%', 300, 2, 3, 32, { d: 30, u: { 'כף': 15 } }],
  ['dairy', 'חלב 3%', 'חלב|חלב מלא', 61, 3.3, 4.7, 3.3, { ml: 1, d: 240, u: { 'כוס': 240 } }],
  ['dairy', 'חלב 1%', 'חלב דל|חלב רזה', 42, 3.4, 4.8, 1, { ml: 1, d: 240, u: { 'כוס': 240 } }],
  ['dairy', 'חלב סויה', 'משקה סויה', 39, 3, 2.5, 1.8, { ml: 1, d: 240, u: { 'כוס': 240 } }],
  ['dairy', 'חלב שקדים', 'משקה שקדים', 15, 0.5, 0.3, 1.2, { ml: 1, d: 240, u: { 'כוס': 240 } }],
  ['dairy', 'חלב שיבולת שועל', 'משקה שיבולת שועל|אוטלי', 45, 1, 6.5, 1.5, { ml: 1, d: 240, u: { 'כוס': 240 } }],
  ['dairy', 'לבן 3%', 'לבן|אשל|ריוויון|רויון', 62, 3.3, 4, 3, { ml: 1, d: 200, u: { 'כוס': 240, 'גביע': 200 } }],
  ['dairy', 'יוגורט', 'יוגורט טבעי|יוגורט 3%', 61, 3.5, 4.7, 3.3, { g: 150, ul: 'גביע' }],
  ['dairy', 'יוגורט יווני', 'סקיר|יוגורט יווני 0%|יוגורט 0%', 59, 10, 3.6, 0.4, { g: 170, ul: 'גביע' }],
  ['dairy', 'יוגורט יווני 5%', 'יוגורט יווני שמן', 95, 8.5, 4, 5, { g: 170, ul: 'גביע' }],
  ['dairy', 'יוגורט פירות', 'יוגורט תות|יוגורט בטעמים', 95, 3.5, 14, 2.8, { g: 150, ul: 'גביע' }],
  ['dairy', 'מעדן שוקולד', 'דני|מעדן|פודינג', 130, 3.5, 19, 4.5, { g: 115, ul: 'גביע' }],
  ['dairy', 'מילקי', '', 120, 3, 17, 4.5, { g: 120, ul: 'גביע' }],
  ['dairy', 'שוקו', 'חלב שוקו|שוקו בשקית', 83, 3.3, 11, 2.5, { ml: 1, d: 240, u: { 'כוס': 240, 'שקית': 250 } }],

  /* ---- carbs: grains, bread, legumes ---- */
  ['carb', 'אורז מבושל', 'אורז|אורז לבן|אורז בסמטי|אורז יסמין', 130, 2.7, 28, 0.3, { d: 200, u: { 'כוס': 160, 'כף': 15 } }],
  ['carb', 'אורז מלא', 'אורז חום', 112, 2.6, 23, 0.9, { d: 200, u: { 'כוס': 160, 'כף': 15 } }],
  ['carb', 'פסטה מבושלת', 'פסטה|ספגטי|מקרוני|פנה|פוזילי', 158, 5.8, 31, 0.9, { d: 200, u: { 'כוס': 140 } }],
  ['carb', 'פסטה מלאה', 'ספגטי מלא', 149, 6, 30, 1.7, { d: 200, u: { 'כוס': 140 } }],
  ['carb', 'פתיתים', 'פתיתים מבושלים|פתיתי אפייה', 150, 5, 30, 0.8, { d: 180, u: { 'כוס': 150 } }],
  ['carb', 'בורגול', 'בורגול מבושל', 83, 3.1, 18.6, 0.2, { d: 180, u: { 'כוס': 180 } }],
  ['carb', 'קוסקוס', 'קוסקוס מבושל', 112, 3.8, 23, 0.2, { d: 200, u: { 'כוס': 160 } }],
  ['carb', 'קינואה', 'קינואה מבושלת', 120, 4.4, 21, 1.9, { d: 180, u: { 'כוס': 185 } }],
  ['carb', 'כוסמת', 'כוסמת מבושלת', 92, 3.4, 20, 0.6, { d: 180, u: { 'כוס': 170 } }],
  ['carb', 'אטריות', 'נודלס|אטריות אורז|ראמן', 138, 4.5, 25, 2, { d: 200, u: { 'כוס': 160 } }],
  ['carb', 'תפוח אדמה', 'תפוחי אדמה|תפו״א|תפוח אדמה מבושל|תפוח אדמה אפוי', 87, 2, 20, 0.1, { g: 170, ul: 'תפוח אדמה' }],
  ['carb', 'פירה', 'פירה תפוחי אדמה', 113, 2, 17, 4.2, { d: 200, u: { 'כוס': 210 } }],
  ['carb', 'צ׳יפס', 'צ׳יפסים|ציפס|צ\'יפס|פרנץ׳ פרייז', 312, 3.4, 41, 15, { d: 130, u: { 'מנה קטנה': 80, 'מנה גדולה': 160 } }],
  ['carb', 'בטטה', 'בטטות|בטטה אפויה', 90, 2, 21, 0.2, { g: 130, ul: 'בטטה' }],
  ['carb', 'תירס', 'קלח תירס|תירס מתוק', 96, 3.4, 21, 1.5, { g: 100, ul: 'קלח', u: { 'כוס': 165 } }],
  ['carb', 'פרוסת לחם', 'לחם|לחם לבן|פרוסות לחם|טוסט', 267, 10, 50, 3.3, { g: 30, ul: 'פרוסה' }],
  ['carb', 'לחם מלא', 'לחם חיטה מלאה|לחם דגנים|לחם כוסמין', 247, 13, 41, 3.4, { g: 30, ul: 'פרוסה' }],
  ['carb', 'לחם שיפון', 'שיפון', 259, 8.5, 48, 3.3, { g: 30, ul: 'פרוסה' }],
  ['carb', 'לחם קל', 'לחם דיאט|לחם קל מלא', 205, 10, 36, 2, { g: 22, ul: 'פרוסה' }],
  ['carb', 'חלה', 'חלות', 310, 9, 53, 7, { g: 40, ul: 'פרוסה' }],
  ['carb', 'פיתה', 'פיתות|פיתה לבנה', 271, 8.6, 54, 1.4, { g: 70, ul: 'פיתה' }],
  ['carb', 'פיתה מלאה', '', 250, 10, 49, 2.5, { g: 70, ul: 'פיתה' }],
  ['carb', 'לאפה', 'לפה|לאפות', 280, 8.5, 53, 3.5, { g: 120, ul: 'לאפה' }],
  ['carb', 'טורטייה', 'טורטיה|טורטיות|ראפ|wrap', 310, 8, 50, 8, { g: 60, ul: 'טורטייה' }],
  ['carb', 'לחמנייה', 'לחמניה|לחמניות|בייגל', 286, 8.6, 53, 4.3, { g: 70, ul: 'לחמנייה' }],
  ['carb', 'באגט', 'בגט|באגטים', 270, 9, 53, 2, { d: 100, u: { 'חצי באגט': 125 } }],
  ['carb', 'פריכיות אורז', 'פריכייה|פריכיות|פריכיות תירס', 387, 8, 81, 3, { g: 9, ul: 'פריכייה' }],
  ['carb', 'קרקר', 'קרקרים|קרקר מלוח|פתית', 430, 10, 70, 12, { g: 6, ul: 'קרקר' }],
  ['carb', 'שיבולת שועל', 'קוואקר|שיבולת|פתיתי שיבולת שועל|דייסת שיבולת שועל|אוטמיל', 380, 13, 67, 7, { d: 60, u: { 'כוס': 80, 'כף': 10 } }],
  ['carb', 'גרנולה', '', 450, 9, 64, 17, { d: 50, u: { 'כוס': 110, 'כף': 12 } }],
  ['carb', 'דגני בוקר', 'קורנפלקס|כריות|דגנים', 380, 7, 84, 1, { d: 40, u: { 'כוס': 30 } }],
  ['carb', 'חומוס', 'סלט חומוס|ממרח חומוס|מנת חומוס|חומוס צבר', 245, 7.5, 13, 18, { d: 100, u: { 'כף': 25, 'צלחת': 250 } }],
  ['carb', 'גרגרי חומוס', 'חומוס מבושל|גרגירי חומוס|חומוס גרגרים', 164, 8.9, 27, 2.6, { d: 150, u: { 'כוס': 165 } }],
  ['carb', 'עדשים', 'עדשים מבושלות|עדשים כתומות|עדשים שחורות', 116, 9, 20, 0.4, { d: 150, u: { 'כוס': 200 } }],
  ['carb', 'שעועית', 'שעועית לבנה|שעועית אדומה|שעועית מבושלת', 127, 8.7, 23, 0.5, { d: 150, u: { 'כוס': 180 } }],
  ['carb', 'מג׳דרה', 'מג׳דרה אורז|מג׳דרה בורגול|מגדרה', 150, 5, 26, 3, { d: 200, u: { 'כוס': 170 } }],
  ['carb', 'פלאפל', 'כדור פלאפל|כדורי פלאפל', 333, 13, 32, 18, { g: 25, ul: 'כדור' }],
  ['carb', 'בורקס', 'בורקס גבינה|בורקס תפוחי אדמה|בורקסים', 350, 8, 30, 22, { g: 100, ul: 'בורקס' }],
  ['carb', 'מלאווח', 'מלוואח|ג׳חנון', 350, 6, 35, 21, { g: 180, ul: 'מלאווח' }],
  ['carb', 'קרואסון', 'קרואסונים|קוראסון', 406, 8, 46, 21, { g: 60, ul: 'קרואסון' }],
  ['carb', 'סוכר', 'סוכר לבן|סוכר חום', 400, 0, 100, 0, { d: 5, u: { 'כפית': 5, 'כף': 12 } }],
  ['carb', 'דבש', '', 304, 0.3, 82, 0, { d: 14, u: { 'כפית': 7, 'כף': 21 } }],
  ['carb', 'סילאן', 'דבש תמרים', 300, 1, 75, 0, { d: 20, u: { 'כפית': 7, 'כף': 20 } }],
  ['carb', 'ריבה', 'ריבת תות|ריבת חלב', 250, 0.4, 62, 0.1, { d: 20, u: { 'כפית': 7, 'כף': 20 } }],

  /* ---- fruit ---- */
  ['produce', 'בננה', 'בננות', 87.5, 1.1, 22.5, 0.3, { g: 120, ul: 'בננה' }],
  ['produce', 'תפוח', 'תפוחים|תפוח עץ|תפוח ירוק', 52, 0.3, 14, 0.2, { g: 180, ul: 'תפוח' }],
  ['produce', 'תפוז', 'תפוזים', 47, 0.9, 12, 0.1, { g: 140, ul: 'תפוז' }],
  ['produce', 'קלמנטינה', 'קלמנטינות|מנדרינה|מנדרינות', 53, 0.8, 13, 0.3, { g: 75, ul: 'קלמנטינה' }],
  ['produce', 'אגס', 'אגסים', 57, 0.4, 15, 0.1, { g: 170, ul: 'אגס' }],
  ['produce', 'ענבים', 'ענב|אשכול ענבים', 69, 0.7, 18, 0.2, { d: 150, u: { 'כוס': 150 } }],
  ['produce', 'אבטיח', '', 30, 0.6, 7.6, 0.2, { d: 300, u: { 'משולש': 280, 'כוס': 150 } }],
  ['produce', 'מלון', 'מלונים', 34, 0.8, 8, 0.2, { d: 200, u: { 'פלח': 150, 'כוס': 160 } }],
  ['produce', 'תותים', 'תות|תות שדה', 32, 0.7, 7.7, 0.3, { d: 150, u: { 'כוס': 150 } }],
  ['produce', 'אוכמניות', 'בלוברי|פירות יער', 57, 0.7, 14, 0.3, { d: 100, u: { 'כוס': 150 } }],
  ['produce', 'מנגו', 'מנגואים', 60, 0.8, 15, 0.4, { g: 200, ul: 'מנגו' }],
  ['produce', 'אננס', '', 50, 0.5, 13, 0.1, { d: 165, u: { 'כוס': 165 } }],
  ['produce', 'אפרסק', 'אפרסקים', 39, 0.9, 10, 0.3, { g: 150, ul: 'אפרסק' }],
  ['produce', 'נקטרינה', 'נקטרינות', 44, 1, 10.5, 0.3, { g: 140, ul: 'נקטרינה' }],
  ['produce', 'שזיף', 'שזיפים', 46, 0.7, 11, 0.3, { g: 65, ul: 'שזיף' }],
  ['produce', 'קיווי', 'קיוי', 61, 1.1, 15, 0.5, { g: 75, ul: 'קיווי' }],
  ['produce', 'רימון', 'רימונים|גרגרי רימון', 83, 1.7, 19, 1.2, { g: 175, ul: 'רימון', u: { 'כוס': 175 } }],
  ['produce', 'אפרסמון', 'אפרסמונים', 70, 0.6, 19, 0.2, { g: 170, ul: 'אפרסמון' }],
  ['produce', 'תאנה', 'תאנים', 74, 0.8, 19, 0.3, { g: 50, ul: 'תאנה' }],
  ['produce', 'דובדבנים', 'דובדבן', 63, 1.1, 16, 0.2, { d: 140, u: { 'כוס': 140 } }],
  ['produce', 'תמר', 'תמרים|מג׳הול|תמר מג׳הול', 277, 1.8, 75, 0.2, { g: 24, ul: 'תמר' }],
  ['produce', 'צימוקים', 'צימוק', 299, 3, 79, 0.5, { d: 30, u: { 'כף': 10, 'חופן': 30 } }],
  ['produce', 'משמש מיובש', 'משמשים מיובשים|פירות יבשים', 241, 3.4, 63, 0.5, { g: 8, ul: 'יחידה' }],
  ['produce', 'אבוקדו', 'אבוקדואים|גוואקמולי', 160, 2, 8.5, 14.7, { g: 150, ul: 'אבוקדו', u: { 'כף': 15 } }],

  /* ---- vegetables ---- */
  ['produce', 'עגבנייה', 'עגבניה|עגבניות', 18, 0.9, 3.9, 0.2, { g: 120, ul: 'עגבנייה' }],
  ['produce', 'עגבניות שרי', 'שרי|עגבניית שרי', 18, 0.9, 3.9, 0.2, { g: 15, ul: 'שרי', u: { 'כוס': 150 } }],
  ['produce', 'מלפפון', 'מלפפונים', 15, 0.7, 3.6, 0.1, { g: 100, ul: 'מלפפון' }],
  ['produce', 'פלפל', 'גמבה|פלפל אדום|פלפל ירוק|פלפלים', 31, 1, 6, 0.3, { g: 150, ul: 'פלפל' }],
  ['produce', 'גזר', 'גזרים', 41, 0.9, 10, 0.2, { g: 70, ul: 'גזר' }],
  ['produce', 'חסה', 'עלי חסה|רוקט|עלים ירוקים', 15, 1.4, 2.9, 0.2, { d: 50, u: { 'כוס': 50 } }],
  ['produce', 'כרוב', 'כרוב לבן|כרוב סגול', 25, 1.3, 6, 0.1, { d: 90, u: { 'כוס': 90 } }],
  ['produce', 'ברוקולי', '', 34, 2.8, 7, 0.4, { d: 150, u: { 'כוס': 90 } }],
  ['produce', 'כרובית', '', 25, 1.9, 5, 0.3, { d: 150, u: { 'כוס': 100 } }],
  ['produce', 'קישוא', 'קישואים|זוקיני', 17, 1.2, 3.1, 0.3, { g: 200, ul: 'קישוא' }],
  ['produce', 'חציל', 'חצילים|חציל קלוי', 25, 1, 6, 0.2, { d: 150 }],
  ['produce', 'בצל', 'בצלים', 40, 1.1, 9.3, 0.1, { g: 110, ul: 'בצל' }],
  ['produce', 'פטריות', 'פטרייה|שמפיניון', 22, 3.1, 3.3, 0.3, { d: 100, u: { 'כוס': 70 } }],
  ['produce', 'תרד', 'עלי תרד', 23, 2.9, 3.6, 0.4, { d: 60, u: { 'כוס': 30 } }],
  ['produce', 'סלק', 'סלקים', 43, 1.6, 10, 0.2, { g: 80, ul: 'סלק' }],
  ['produce', 'שעועית ירוקה', 'שעועית ירוקה מבושלת', 31, 1.8, 7, 0.1, { d: 150, u: { 'כוס': 125 } }],
  ['produce', 'אפונה', 'אפונה ירוקה', 81, 5.4, 14, 0.4, { d: 100, u: { 'כוס': 145 } }],
  ['produce', 'סלט ירקות', 'סלט|סלט ישראלי|סלט קצוץ', 30, 1.2, 5, 0.5, { d: 200, u: { 'כוס': 150 } }],
  ['produce', 'זיתים', 'זית|זיתים ירוקים|זיתים שחורים', 145, 1, 3.8, 15, { g: 4, ul: 'זית', d: 30 }],

  /* ---- fats, nuts, spreads ---- */
  ['fat', 'שמן זית', 'שמן|שמן קנולה|שמן צמחי', 884, 0, 0, 100, { d: 10, u: { 'כף': 14, 'כפית': 4.5 } }],
  ['fat', 'חמאה', '', 717, 0.9, 0.1, 81, { d: 10, u: { 'כף': 14, 'כפית': 5 } }],
  ['fat', 'טחינה', 'טחינה גולמית|טחינה משומשום', 595, 17, 21, 54, { d: 20, u: { 'כף': 15, 'כפית': 5 } }],
  ['fat', 'טחינה מוכנה', 'רוטב טחינה|טחינה מדוללת', 300, 8.5, 10, 26, { d: 40, u: { 'כף': 20 } }],
  ['fat', 'מיונז', '', 680, 1, 0.6, 75, { d: 14, u: { 'כף': 14, 'כפית': 5 } }],
  ['fat', 'מיונז לייט', 'מיונז דל', 330, 1, 6, 33, { d: 14, u: { 'כף': 14, 'כפית': 5 } }],
  ['fat', 'קטשופ', '', 101, 1, 26, 0.1, { d: 15, u: { 'כף': 15 } }],
  ['fat', 'חמאת בוטנים', 'חמאת אגוזים|חמאת שקדים', 588, 25, 20, 50, { d: 20, u: { 'כף': 16, 'כפית': 6 } }],
  ['fat', 'שקדים', 'שקד', 579, 21, 22, 50, { d: 30, u: { 'חופן': 28 } }],
  ['fat', 'אגוזי מלך', 'אגוזים|אגוז|אגוז מלך', 654, 15, 14, 65, { d: 30, u: { 'חופן': 28 } }],
  ['fat', 'קשיו', 'קשיו קלוי', 553, 18, 30, 44, { d: 30, u: { 'חופן': 28 } }],
  ['fat', 'בוטנים', 'בוטן|בוטנים קלויים', 567, 26, 16, 49, { d: 30, u: { 'חופן': 28 } }],
  ['fat', 'פיסטוקים', 'פיסטוק', 560, 20, 28, 45, { d: 30, u: { 'חופן': 28 } }],
  ['fat', 'גרעינים', 'גרעיני חמנייה|גרעינים לבנים|גרעיני דלעת', 584, 21, 20, 51, { d: 30, u: { 'חופן': 28 } }],
  ['fat', 'זרעי צ׳יה', 'צ׳יה|צ\'יה', 486, 17, 42, 31, { d: 12, u: { 'כף': 12 } }],
  ['fat', 'זרעי פשתן', 'פשתן', 534, 18, 29, 42, { d: 10, u: { 'כף': 10 } }],

  /* ---- sweets and snacks ---- */
  ['sweet', 'שוקולד חלב', 'שוקולד|מילקה|שוקולד פרה', 535, 7.6, 59, 30, { d: 25, u: { 'קובייה': 5, 'טבלה': 100 } }],
  ['sweet', 'שוקולד מריר', 'שוקולד 70%|מריר', 598, 7.8, 46, 43, { d: 25, u: { 'קובייה': 5, 'טבלה': 100 } }],
  ['sweet', 'ממרח שוקולד', 'נוטלה|ממרח נוגט', 539, 6.3, 57, 31, { d: 20, u: { 'כף': 20, 'כפית': 7 } }],
  ['sweet', 'במבה', '', 534, 15, 41, 34, { d: 25, u: { 'שקית': 80 } }],
  ['sweet', 'ביסלי', '', 487, 10, 66, 20, { d: 35, u: { 'שקית': 70 } }],
  ['sweet', 'תפוצ׳יפס', 'צ׳יפס שקית|חטיף תפוצ׳יפס|תפוציפס', 536, 7, 53, 34, { d: 30, u: { 'שקית': 50 } }],
  ['sweet', 'פופקורן', 'פופקורן מיקרו', 430, 9, 64, 15, { d: 30, u: { 'כוס': 10 } }],
  ['sweet', 'בייגלה', 'בייגלה מלוח|פרצל', 380, 10, 76, 3, { d: 30, u: { 'חופן': 25 } }],
  ['sweet', 'חטיף דגנים', 'חטיף אנרגיה|נייצ׳ר וואלי|חטיף גרנולה', 400, 6, 66, 12, { g: 25, ul: 'חטיף' }],
  ['sweet', 'עוגייה', 'עוגיות|ביסקוויט|פתי בר', 480, 6, 65, 22, { g: 15, ul: 'עוגייה' }],
  ['sweet', 'וופל', 'ופלים|ופלה|וופלים', 520, 5, 63, 28, { g: 10, ul: 'ופלה' }],
  ['sweet', 'עוגה', 'עוגת שיש|עוגת שוקולד|עוגת שמרים|רוגלך|פרוסת עוגה', 380, 5.5, 52, 17, { d: 60, u: { 'פרוסה': 60 } }],
  ['sweet', 'מאפין', 'מאפינס|קאפקייק', 380, 6, 52, 17, { g: 90, ul: 'מאפין' }],
  ['sweet', 'סופגנייה', 'סופגניה|דונאט|סופגניות', 400, 6, 45, 22, { g: 90, ul: 'סופגנייה' }],
  ['sweet', 'גלידה', 'גלידות|כדור גלידה|ארטיק', 207, 3.5, 24, 11, { d: 120, u: { 'כדור': 60 } }],

  /* ---- drinks ---- */
  ['drink', 'קולה', 'קוקה קולה|קוקה-קולה|פפסי|משקה מוגז|שתייה מתוקה', 42, 0, 10.6, 0, { d: 330, u: { 'כוס': 240, 'פחית': 330, 'בקבוק חצי': 500 } }],
  ['drink', 'קולה זירו', 'קולה דיאט|זירו|דיאט|משקה דיאט', 0.4, 0, 0, 0, { d: 330, u: { 'כוס': 240, 'פחית': 330 } }],
  ['drink', 'מיץ תפוזים', 'מיץ|מיץ טבעי|מיץ סחוט', 45, 0.7, 10.4, 0.2, { d: 240, u: { 'כוס': 240 } }],
  ['drink', 'מיץ תפוחים', 'מיץ ענבים|פרי גת|מיץ פירות', 46, 0.1, 11.3, 0.1, { d: 240, u: { 'כוס': 240 } }],
  ['drink', 'לימונדה', 'לימונענע|תפוזינה|פטל', 40, 0, 10, 0, { d: 240, u: { 'כוס': 240 } }],
  ['drink', 'שייק פירות', 'סמותי|שייק בננה', 60, 1, 14, 0.3, { d: 300, u: { 'כוס': 300 } }],
  ['drink', 'משקה ספורט', 'משקה איזוטוני|גטורייד|פאוורייד', 26, 0, 6.4, 0, { d: 500, u: { 'בקבוק': 500 } }],
  ['drink', 'משקה אנרגיה', 'רד בול|XL|אקס אל|בלו', 45, 0, 11, 0, { d: 250, u: { 'פחית': 250 } }],
  ['drink', 'בירה', 'בירות|גולדסטאר|קרלסברג|היינקן', 42, 0.45, 3.3, 0, { d: 330, u: { 'בקבוק': 330, 'חצי ליטר': 500 } }],
  ['drink', 'יין', 'יין אדום|יין לבן|כוס יין', 83, 0.1, 2.6, 0, { d: 150, u: { 'כוס': 150 } }],
  ['drink', 'קפה הפוך', 'קפוצ׳ינו|הפוך|קפה עם חלב|לאטה|נס קפה', 45, 2.5, 4, 2, { g: 200, ul: 'כוס' }],
  ['drink', 'תה', 'תה ירוק|תה צמחים|חליטה', 1, 0, 0.2, 0, { d: 240, u: { 'כוס': 240 } }],
  ['drink', 'קפה שחור', 'אספרסו|קפה|קפה טורקי|אמריקנו', 2, 0.1, 0, 0, { d: 240, u: { 'כוס': 240, 'אספרסו': 30 } }],

  /* ---- ready dishes ---- */
  ['dish', 'שווארמה בפיתה', 'שווארמה|שוארמה|מנת שווארמה', 233, 13.3, 18.3, 11.7, { g: 300, ul: 'מנה' }],
  ['dish', 'שווארמה בלאפה', 'שוארמה בלאפה', 233, 13.3, 18.3, 11.7, { g: 400, ul: 'לאפה' }],
  ['dish', 'פלאפל בפיתה', 'מנת פלאפל|חצי מנה פלאפל', 180, 6, 21, 8, { g: 350, ul: 'מנה' }],
  ['dish', 'סביח', 'סביח בפיתה', 185, 6, 18, 10, { g: 350, ul: 'מנה' }],
  ['dish', 'המבורגר בלחמנייה', 'המבורגר|בורגר|המבורגר מלא', 226, 12, 20, 11, { g: 230, ul: 'המבורגר' }],
  ['dish', 'משולש פיצה', 'פיצה|משולשי פיצה|פיצה מרגריטה', 238, 10, 30, 8.3, { g: 120, ul: 'משולש' }],
  ['dish', 'טוסט גבינה', 'טוסט גבינה צהובה|סנדוויץ׳ גבינה', 270, 13, 27, 12, { g: 130, ul: 'טוסט' }],
  ['dish', 'סושי', 'רול סושי|מאקי|ניגירי', 155, 6, 25, 3.5, { g: 30, ul: 'יחידה' }],
  ['dish', 'פסטה בולונז', 'ספגטי בולונז|פסטה בשר', 150, 8, 18, 5, { d: 350, u: { 'צלחת': 350 } }],
  ['dish', 'פסטה ברוטב עגבניות', 'פסטה אדומה|פסטה ברוטב', 120, 4, 21, 2.5, { d: 300, u: { 'צלחת': 300 } }],
  ['dish', 'פסטה ברוטב שמנת', 'פסטה לבנה|פסטה שמנת פטריות|אלפרדו', 190, 6, 22, 9, { d: 300, u: { 'צלחת': 300 } }],
  ['dish', 'לזניה', '', 160, 9, 14, 7.5, { d: 300, u: { 'צלחת': 300 } }],
  ['dish', 'מוקפץ', 'מוקפץ עוף|מוקפץ אטריות|נודלס מוקפץ', 150, 9, 18, 4.5, { d: 350, u: { 'צלחת': 350 } }],
  ['dish', 'מרק עוף', 'מרק עוף עם ירקות|ציר עוף', 36, 3, 2.5, 1.5, { d: 300, u: { 'קערה': 300 } }],
  ['dish', 'מרק ירקות', 'מרק|מרק דלעת|מרק בטטה', 35, 1.2, 6, 0.8, { d: 300, u: { 'קערה': 300 } }],
  ['dish', 'מרק עדשים', 'מרק אפונה|מרק שעועית', 90, 5.5, 14, 1.5, { d: 300, u: { 'קערה': 300 } }]
];

/** Turn a row into the food object the rest of the app reads. */
function toFood([cat, name, aliases, kcal, p, c, f, o = {}]) {
  return {
    id: `f:${name}`, cat, name,
    k: [name, ...(aliases ? aliases.split('|') : [])],
    kcal, p, c, f,
    g: o.g || null, ul: o.ul || null,
    d: o.d || o.g || 100,
    u: o.u || null,
    ml: !!(o.ml || cat === 'drink')
  };
}

export const FOODS = ROWS.map(toFood);
export const foodCount = FOODS.length;
const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

/* ==========================================================================
   Search
   ========================================================================== */

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** Fold everything that should not decide a match: punctuation, gershayim,
    final letters (so "עו" finds "עוף" and "שקד" finds "שקדים"), case. */
export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[׳'״"`.,()\-%]/g, '')
    .replace(/[ךםןףץ]/g, (ch) => FINALS[ch])
    .replace(/\s+/g, ' ')
    .trim();
}

/* Indexing once, not per keystroke: 200 foods × a dozen aliases is nothing,
   but folding them on every input event is still wasted work. */
const INDEX = new WeakMap();
const keysOf = (food) => {
  let keys = INDEX.get(food);
  if (!keys) { keys = food.k.map(norm); INDEX.set(food, keys); }
  return keys;
};

/**
 * Rank foods against what was typed.
 * exact name > alias exact > starts with > a word starts with > contains.
 * Every word of a multi-word query has to land somewhere.
 * @param {string} query
 * @param {Array} extra the user's own foods, searched alongside the database
 */
export function searchFoods(query, extra = [], limit = 40) {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(' ');
  const scored = [];
  for (const food of [...extra, ...FOODS]) {
    const keys = food.k ? keysOf(food) : [norm(food.name)];
    let best = 0;
    keys.forEach((key, i) => {
      let s = 0;
      if (key === q) s = i === 0 ? 100 : 90;
      else if (key.startsWith(q)) s = 75 - Math.min(15, key.length - q.length);
      else if (key.split(' ').some((w) => w.startsWith(q))) s = 55;
      else if (key.includes(q)) s = 40;
      else if (words.length > 1 && words.every((w) => key.includes(w))) s = 35;
      if (i === 0 && s) s += 4;           // the name itself beats an alias
      best = Math.max(best, s);
    });
    if (best) scored.push({ food, s: best + (food.custom ? 3 : 0) });
  }
  const seen = new Set();
  return scored
    .sort((a, b) => b.s - a.s || a.food.name.length - b.food.name.length)
    .map((x) => x.food)
    .filter((f) => (seen.has(f.id) ? false : seen.add(f.id)))
    .slice(0, limit);
}

export const foodById = (id) => BY_ID.get(id) || null;

/** What people reach for most — shown before anything is typed. */
export const POPULAR = [
  'ביצה', 'חזה עוף', 'קוטג׳ 5%', 'יוגורט יווני', 'סקופ אבקת חלבון', 'אורז מבושל',
  'פרוסת לחם', 'בננה', 'טונה במים', 'שיבולת שועל', 'אבוקדו', 'סלט ירקות'
].map((n) => BY_ID.get(`f:${n}`)).filter(Boolean);

/* ==========================================================================
   Portions
   ========================================================================== */

/**
 * The ways a food can be measured, each with its gram weight.
 * A natural unit first (a pita, an egg), then household measures, and grams
 * always — except for a "serving" food saved from a photo or a description,
 * where only the serving itself is known.
 * @returns {Array<{id:string,label:string,g:number}>}
 */
export function unitsFor(food) {
  const out = [];
  if (food.serving) return [{ id: 'serving', label: 'מנה', g: food.g || 100 }];
  if (food.g) out.push({ id: 'unit', label: food.ul || 'יחידה', g: food.g });
  for (const [label, g] of Object.entries(food.u || {})) out.push({ id: `u:${label}`, label, g });
  for (const [label, g] of householdFor(food)) {
    if (!out.some((u) => u.label === label)) out.push({ id: `h:${label}`, label, g });
  }
  out.push({ id: 'g', label: food.ml ? 'מ״ל' : 'גרם', g: 1 });
  return out;
}

/* ==========================================================================
   Everyday measures.

   Nobody pictures 250 g of rice; everybody pictures a plate. Foods that do
   not name their own measures get the ones their kind is eaten in — a
   plate for cooked grains and dishes, a bowl for salad, a palm-sized piece
   for meat or fish, a cup, mug, can or bottle for drinks, spoons for
   spreads — and any gram or millilitre amount is described back in them.
   The weights are typical servings, so the description says "≈".
   ========================================================================== */

const HOUSEHOLD = {
  drink: [['כוס קטנה', 150], ['כוס', 240], ['ספל', 300], ['בקבוק קטן', 500]],
  plate: [['צלחת קטנה', 150], ['צלחת בינונית', 250], ['צלחת גדולה', 350]],
  bowl: [['קערה קטנה', 150], ['קערה', 250]],
  piece: [['מנה קטנה', 100], ['מנה בגודל כף יד', 150], ['מנה גדולה', 220]],
  spoon: [['כפית', 5], ['כף', 15]]
};

function householdFor(food) {
  const own = [food.ul, ...Object.keys(food.u || {})].filter(Boolean);
  const hasOwn = (re) => own.some((l) => re.test(l));
  if (food.custom && !food.ml) return [];
  if (food.ml || food.cat === 'drink') return HOUSEHOLD.drink;
  if (food.g) return [];                       // an egg, a pita, a bar: counted, not measured
  const d = food.d || 100;
  if ((food.cat === 'carb' || food.cat === 'dish') && d >= 150 && !hasOwn(/צלחת|קערה/)) return HOUSEHOLD.plate;
  if (food.cat === 'produce' && d >= 100 && !hasOwn(/קערה|משולש|פלח/)) return HOUSEHOLD.bowl;
  if (food.cat === 'protein' && d >= 100 && !hasOwn(/קופסה|מחבת/)) return HOUSEHOLD.piece;
  if (d <= 40 && !hasOwn(/כף|חופן|קובייה|פרוסה|שקית/)) return HOUSEHOLD.spoon;
  return [];
}

/* plural forms for counting more than one */
const PLURAL = {
  'כוס': 'כוסות', 'ספל': 'ספלים', 'פחית': 'פחיות', 'כף': 'כפות', 'כפית': 'כפיות', 'קערה': 'קערות',
  'פרוסה': 'פרוסות', 'חופן': 'חופנים', 'גביע': 'גביעים', 'מנה': 'מנות', 'בקבוק': 'בקבוקים', 'קופסה': 'קופסאות',
  'צלחת': 'צלחות', 'יחידה': 'יחידות', 'סקופ': 'סקופים', 'קובייה': 'קוביות', 'כדור': 'כדורים', 'משולש': 'משולשים',
  'צלחת קטנה': 'צלחות קטנות', 'צלחת בינונית': 'צלחות בינוניות', 'צלחת גדולה': 'צלחות גדולות',
  'כוס קטנה': 'כוסות קטנות', 'קערה קטנה': 'קערות קטנות', 'בקבוק קטן': 'בקבוקים קטנים',
  'מנה קטנה': 'מנות קטנות', 'מנה גדולה': 'מנות גדולות',
  'ביצה': 'ביצים', 'פיתה': 'פיתות', 'לחמנייה': 'לחמניות', 'בננה': 'בננות', 'תפוח': 'תפוחים', 'תמר': 'תמרים',
  'חטיף': 'חטיפים', 'עוגייה': 'עוגיות', 'קציצה': 'קציצות', 'כדור': 'כדורים', 'זית': 'זיתים', 'שרי': 'שרי'
};

/** "כוס וחצי", "חצי צלחת בינונית", "2 כוסות" — a count of a measure in words. */
function countPhrase(n, label) {
  const whole = Math.floor(n + 1e-9);
  const frac = Math.round((n - whole) * 4) / 4;
  const many = (k) => (PLURAL[label] ? `${k} ${PLURAL[label]}` : `${k} × ${label}`);
  if (!whole) return frac === 0.5 ? `חצי ${label}` : frac === 0.25 ? `רבע ${label}` : `שלושה רבעים ${label}`;
  const base = whole === 1 ? label : many(whole);
  return frac === 0.5 ? `${base} וחצי` : frac === 0.25 ? `${base} ורבע` : frac === 0.75 ? `${base} ושלושה רבעים` : base;
}

/* Rounder is better: a plate beats three quarters of a plate. */
const NICE = [[1, 0], [2, 0.01], [0.5, 0.02], [1.5, 0.02], [3, 0.02], [2.5, 0.04], [4, 0.04], [0.25, 0.06], [0.75, 0.06], [1.25, 0.06]];

/**
 * An amount in grams (or ml) said as an everyday measure, or null when no
 * measure of this food comes within about 12%.
 */
export function describeAmount(food, grams) {
  if (!(grams > 0) || food.serving) return null;
  let best = null;
  for (const u of unitsFor(food)) {
    if (u.id === 'g' || u.g <= 1) continue;
    const n = grams / u.g;
    for (const [nice, penalty] of NICE) {
      const score = Math.abs(n - nice) / nice + penalty;
      if (score <= 0.15 && (!best || score < best.score)) best = { score, text: countPhrase(nice, u.label) };
    }
  }
  return best ? best.text : null;
}

/** The portion a food opens on: one unit if it has one, else its usual
    amount — said as a can or a cup when it comes out to a whole one. */
export function defaultPortion(food) {
  const units = unitsFor(food);
  if (food.serving || food.g) return { unit: units[0], qty: 1 };
  return portionForGrams(food, food.d || 100);
}

/**
 * Macros for an amount of a food.
 * @returns {{label,amount,cat,kcal,p,c,f,fid,grams}} — the logged item shape
 */
export function portion(food, unit, qty) {
  const grams = Math.max(0, unit.g * qty);
  const k = grams / 100;
  let amount;
  if (food.serving) {
    amount = qty === 1 ? food.serving : `${fmt(qty)} × ${food.serving}`;
  } else if (unit.id === 'g') {
    const like = describeAmount(food, grams);
    amount = `${Math.round(grams)} ${unit.label}${like ? ` (≈ ${like})` : ''}`;
  } else {
    /* "2 ביצים", "פיתה וחצי" when the count is a round one; "2.3 × כוס" otherwise. */
    const words = Math.abs(qty * 4 - Math.round(qty * 4)) < 1e-6 && qty > 0 ? countPhrase(qty, unit.label) : `${fmt(qty)} × ${unit.label}`;
    amount = `${words} (${Math.round(grams)} ${food.ml ? 'מ״ל' : 'ג׳'})`;
  }
  return {
    label: food.name, amount, cat: food.cat,
    kcal: round1(food.kcal * k), p: round1(food.p * k), c: round1(food.c * k), f: round1(food.f * k),
    fid: food.id, grams: Math.round(grams * 10) / 10
  };
}

/**
 * A logged item back to a food you can measure again.
 * Items that came through the database carry their food id and grams; ones
 * that came from a photo or a description become a one-serving food, so
 * "again, but double" still works on them.
 */
export function foodFromItem(item, lookup = foodById) {
  const known = item.fid && lookup(item.fid);
  if (known && item.grams) return { food: known, grams: item.grams };
  return {
    food: {
      id: `s:${item.label}|${item.amount || ''}`, cat: item.cat || 'dish', name: item.label,
      k: [item.label], serving: item.amount || 'מנה', g: 100, d: 100,
      kcal: item.kcal || 0, p: item.p || 0, c: item.c || 0, f: item.f || 0
    },
    grams: 100
  };
}

/** Best portion for a known gram weight: a whole number of some unit if one fits. */
export function portionForGrams(food, grams) {
  const units = unitsFor(food);
  for (const u of units) {
    if (u.id === 'g') continue;
    const n = grams / u.g;
    if (Math.abs(n * 2 - Math.round(n * 2)) < 0.02 && n > 0) return { unit: u, qty: Math.round(n * 2) / 2 };
  }
  return { unit: units.find((u) => u.id === 'g') || units[0], qty: Math.round(grams) };
}

/**
 * A food the user defined — from a package label, or from the AI's answer
 * about something the database lacks. Values are per 100 g.
 */
export function makeFood({ id, name, cat = 'dish', kcal, p, c, f, g, ul, d, src, serving }) {
  const clean = (n) => Math.max(0, Math.round((Number(n) || 0) * 10) / 10);
  const food = {
    id: id || `c:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    cat, name: String(name || '').trim(), k: [String(name || '').trim()],
    kcal: clean(kcal), p: clean(p), c: clean(c), f: clean(f),
    g: Number(g) > 0 ? Number(g) : null, ul: g ? (ul || 'יחידה') : null,
    d: Number(d) > 0 ? Number(d) : (Number(g) > 0 ? Number(g) : 100),
    u: null, custom: true, src: src || 'manual'
  };
  /* A serving with no known weight: its values are per serving, measured
     in servings only (see unitsFor). */
  if (serving) Object.assign(food, { serving, g: 100, ul: null, d: 100 });
  return food;
}

/** True when the built-in database already knows this name. */
export const isKnownFood = (name) => ALIAS.has(clean(String(name || '').trim()));

/**
 * An item the AI described (from a photo or a sentence) → a food that can be
 * kept and found again offline. With a weight, it is stored per 100 g and a
 * serving becomes its natural unit; without one, as a serving.
 * @returns {{food:object, grams:number}|null} null when nothing is worth keeping
 */
export function foodFromAiItem(item) {
  const name = String(item.label || '').trim();
  if (!name || !(item.kcal > 0)) return null;
  const m = /(\d+(?:\.\d+)?)\s*(?:גרם|גר׳|ג׳|ג(?![א-ת])|מ״ל|מ"ל|מל|g\b|ml\b)/i.exec(String(item.amount || ''));
  const grams = Number(item.grams) > 0 ? Number(item.grams) : (m ? Number(m[1]) : 0);
  if (grams > 0) {
    const k = 100 / grams;
    const food = makeFood({
      name, cat: item.cat, kcal: item.kcal * k, p: item.p * k, c: item.c * k, f: item.f * k,
      g: grams, ul: 'מנה', src: 'ai'
    });
    return { food, grams };
  }
  const food = makeFood({
    name, cat: item.cat, kcal: item.kcal, p: item.p, c: item.c, f: item.f,
    serving: item.amount || 'מנה', src: 'ai'
  });
  return { food, grams: 100 };
}

/* ==========================================================================
   Free-text parser — "שתי ביצים וסקופ חלבון"
   ========================================================================== */

const NUM_WORDS = {
  'חצי': 0.5, 'רבע': 0.25,
  'אחת': 1, 'אחד': 1, 'אחדת': 1,
  'שתי': 2, 'שני': 2, 'שניים': 2, 'שתיים': 2, 'זוג': 2,
  'שלוש': 3, 'שלושה': 3, 'שלש': 3,
  'ארבע': 4, 'ארבעה': 4,
  'חמש': 5, 'חמישה': 5,
  'שש': 6, 'שישה': 6,
  'שבע': 7, 'שבעה': 7,
  'שמונה': 8,
  'תשע': 9, 'תשעה': 9,
  'עשר': 10, 'עשרה': 10
};

/* unit → grams (approximate household measures, when the food has none of its own) */
const UNIT_G = {
  'כוס': 200, 'כוסות': 200,
  'כף': 15, 'כפות': 15,
  'כפית': 5, 'כפיות': 5,
  'סקופ': 30, 'סקופים': 30,
  'פרוסה': 30, 'פרוסות': 30,
  'קופסה': 150, 'קופסת': 150,
  'מנה': 200, 'מנות': 200,
  'חופן': 28, 'חופנים': 28,
  'צלחת': 250, 'צלחות': 250,
  'קערה': 250, 'קערת': 250, 'קערות': 250,
  'ספל': 300, 'ספלים': 300,
  'פחית': 330, 'פחיות': 330,
  'בקבוק': 500, 'בקבוקים': 500,
  'קילו': 1000, 'קילוגרם': 1000,
  'יחידה': 0, 'יחידות': 0
};
/* plural → the label a food's own measure uses */
const UNIT_SINGULAR = {
  'כוסות': 'כוס', 'כפות': 'כף', 'כפיות': 'כפית', 'פרוסות': 'פרוסה', 'קופסת': 'קופסה', 'חופנים': 'חופן',
  'צלחות': 'צלחת', 'קערת': 'קערה', 'קערות': 'קערה', 'ספלים': 'ספל', 'פחיות': 'פחית', 'בקבוקים': 'בקבוק'
};
/* A word for a measure → the labels a food's measures may carry for it. */
const UNIT_LABELS = { 'צלחת': ['צלחת', 'צלחת בינונית'], 'קערה': ['קערה'], 'בקבוק': ['בקבוק', 'בקבוק קטן'] };

const GRAM_WORDS = new Set(['גרם', 'גר', 'ג׳', 'ג', 'g', 'גראם']);

/* alias → food, keyed by the exact token phrase. Aliases with % or ׳ are kept
   as typed and also without them, since people type both. */
const ALIAS = new Map();
let MAX_WORDS = 1;
for (const food of FOODS) {
  for (const alias of food.k) {
    for (const a of new Set([alias, clean(alias)])) {
      if (!a || ALIAS.has(a)) continue;
      ALIAS.set(a, food);
      MAX_WORDS = Math.max(MAX_WORDS, a.split(' ').length);
    }
  }
}

function clean(w) { return w.replace(/[.,!?;:״"׳'()%]/g, '').trim(); }

/** "ובננה" → "בננה". Only the conjunctive vav, and only when something is left. */
const dropVav = (w) => (w.length > 2 && w.startsWith('ו') ? w.slice(1) : null);

/**
 * Parse a free-text meal description into macro rows.
 * Scans the whole sentence for food phrases rather than splitting on
 * punctuation, so "שתי ביצים וסקופ חלבון" yields both foods.
 *
 * @returns {{items:Array, total:{kcal:number,p:number,c:number,f:number}, unmatched:string[]}}
 */
export function parseMeal(text, extra = []) {
  const raw = (text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { items: [], total: zero(), unmatched: [] };

  const tokens = raw.split(' ').map(clean).filter(Boolean);

  /* The user's own foods (learned from the AI or typed off a label) are
     words the parser knows too — and win over the database, being the more
     specific of the two. */
  const mine = new Map();
  let maxWords = MAX_WORDS;
  for (const food of extra) {
    for (const alias of food.k || [food.name]) {
      const a = clean(alias || '');
      if (!a || mine.has(a)) continue;
      mine.set(a, food);
      maxWords = Math.max(maxWords, a.split(' ').length);
    }
  }
  const lookup = (c) => mine.get(c) || ALIAS.get(c);

  /* 1. locate non-overlapping food phrases, longest phrase first */
  const longestAt = (i) => {
    for (let n = Math.min(maxWords, tokens.length - i); n >= 1; n--) {
      const slice = tokens.slice(i, i + n);
      const candidates = [slice.join(' ')];
      const stripped = dropVav(slice[0]);
      if (stripped) candidates.push([stripped, ...slice.slice(1)].join(' '));
      for (const c of candidates) {
        const food = lookup(c);
        if (food) return { food, start: i, end: i + n };
      }
    }
    return null;
  };
  const matches = [];
  let i = 0;
  while (i < tokens.length) {
    const hit = longestAt(i);
    /* "פרוסות לחם מלא": a phrase starting one word later that reaches
       further wins, and the word it skipped is read as the quantity. */
    const next = hit && hit.end > i + 1 ? longestAt(i + 1) : null;
    if (hit && !(next && next.end > hit.end)) { matches.push(hit); i = hit.end; } else i++;
  }

  if (!matches.length) return { items: [], total: zero(), unmatched: [raw] };

  /* 2. give each match the quantity words nearest to it */
  const items = [];
  const used = new Set();
  matches.forEach((m, idx) => {
    for (let k = m.start; k < m.end; k++) used.add(k);
    const prevEnd = idx === 0 ? 0 : matches[idx - 1].end;
    const nextStart = idx === matches.length - 1 ? tokens.length : matches[idx + 1].start;
    const before = tokens.slice(prevEnd, m.start);
    const after = tokens.slice(m.end, nextStart);
    const qty = readQuantity(before, after, used, prevEnd, m.end);
    items.push(toItem(m.food, qty));
  });

  /* 3. report words that matched nothing, so the user can correct them */
  const unmatched = tokens
    .map((t, k) => (used.has(k) ? null : t))
    .filter((t) => t && t.length > 2 && !NUM_WORDS[t] && UNIT_G[t] == null && !GRAM_WORDS.has(t) && !/^\d/.test(t) && !isFiller(t));

  const total = items.reduce((t, it) => ({
    kcal: t.kcal + it.kcal, p: t.p + it.p, c: t.c + it.c, f: t.f + it.f
  }), zero());

  return { items, total: roundAll(total), unmatched: Array.from(new Set(unmatched)) };
}

const FILLERS = new Set(['עם', 'ועוד', 'ואז', 'של', 'בערך', 'בערן', 'אכלתי', 'שתיתי', 'היום', 'בבוקר', 'בצהריים', 'בערב', 'ארוחת', 'ארוחה', 'קצת', 'גם']);
const isFiller = (w) => FILLERS.has(w) || FILLERS.has(dropVav(w) || '');

/**
 * Read a quantity from the words around a food phrase.
 * Preference: explicit grams → household unit → bare count → default portion.
 */
function readQuantity(before, after, used, beforeStart, afterStart) {
  const scan = (list, offset) => {
    let count = null, unit = null, grams = null;
    list.forEach((w, k) => {
      const bare = dropVav(w) || w;
      const num = /^\d+(?:\.\d+)?$/.test(w) ? Number(w) : (NUM_WORDS[bare] ?? null);
      if (num != null && count == null) { count = num; used.add(offset + k); }
      if (GRAM_WORDS.has(bare) && count != null && grams == null) { grams = count; used.add(offset + k); }
      if (UNIT_G[bare] != null && UNIT_G[bare] > 0 && unit == null) { unit = bare; used.add(offset + k); }
    });
    return { count, unit, grams };
  };

  const b = scan(before, beforeStart);
  if (b.grams != null || b.unit != null || b.count != null) return b;
  return scan(after, afterStart);
}

/** A parsed quantity → a logged item, through the same portion maths the sheet uses. */
function toItem(food, { count, unit, grams }) {
  const units = unitsFor(food);
  const gramUnit = units.find((u) => u.id === 'g');
  if (grams != null) return portion(food, gramUnit, grams);
  if (unit != null) {
    /* The food's own cup beats the generic one: a cup of rice is 160 g, a
       cup of milk 240. */
    const label = UNIT_SINGULAR[unit] || unit;
    const labels = UNIT_LABELS[label] || [label];
    const own = units.find((u) => labels.includes(u.label));
    if (own) return portion(food, own, count || 1);
    return portion(food, gramUnit, UNIT_G[unit] * (count || 1));
  }
  const def = defaultPortion(food);
  return portion(food, def.unit, def.qty * (count || 1));
}

const zero = () => ({ kcal: 0, p: 0, c: 0, f: 0 });
const round1 = (n) => Math.round(n * 10) / 10;
const roundAll = (t) => ({ kcal: Math.round(t.kcal), p: round1(t.p), c: round1(t.c), f: round1(t.f) });
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(round1(n)));
