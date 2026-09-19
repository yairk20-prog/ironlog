# HANDOFF — מצב הפרויקט

הקובץ הזה נכתב כדי להעביר את הפרויקט לשיחה חדשה שבה ה-repo מחובר.
כל ההיסטוריה (12 קומיטים) נמצאת כאן. אין צורך בשיחה הקודמת.

## מה צריך לעשות ראשון בשיחה החדשה

```bash
git clone ironlog-repo.bundle gym      # אם הגעת מקובץ bundle
cd gym
git remote add origin <כתובת ה-repo>   # ה-repo שמחובר לשיחה
git push -u origin main
```

אחרי ה-push: ב-Netlify → **Add new site → Import an existing project → GitHub** → לבחור
את ה-repo. `netlify.toml` כבר מגדיר publish directory ו-functions, אין build command.
רק אחרי חיבור ל-Git רצות ה-Netlify Functions (Netlify Drop לא מריץ אותן).

## מה כבר עובד

- PWA עברית RTL, ללא build step. כל מסך הוא מודול ES שמייצא `render(ctx)`.
- IndexedDB (`js/db.js`, DB_VERSION 2) — אימונים, סטים, תזונה, מדידות גוף, הגדרות.
- מנוע תוכנית PPL עם progressive overload ו-**כמה מטרות במקביל** (`resolveGoal` ב-`js/programs.js`).
- **`js/figure.js`** — הדגמת תרגיל מצוירת (23 דפוסי תנועה), לא GIF מהאינטרנט.
- **`js/feed.js`** — מצב פיד בהחלקה, כרטיס לכל תרגיל + כרטיס מנוחה.
- **`js/rest.js` / `js/timer.js`** — טיימר מנוחה עם דוק נגרר, כפתורי ‎−20/+20.
- תזונה מחולקת לארוחות + הנחיות לפי מטרה + מים בכוסות.
- `netlify/functions/coach.js` — מאמן AI דרך פרוקסי: **המפתח יושב אצל בעל האתר בלבד**,
  המשתמשים לא מזינים כלום. צריך להגדיר `ANTHROPIC_API_KEY` ב-Netlify → Environment variables.
- `netlify/functions/backup.js` + `js/cloud.js` — גיבוי ענן ללא חשבון, לפי קוד שחזור.
- דף הבית מציג כרטיס "מחר" — תצוגה מקדימה של יום האימון (או המנוחה) הבא בסבב, אחרי
  התרגילים של היום (`dayCard`/`restDayCard` המשותפים מ-`js/screen-plan.js`).
- זיהוי קלוריות מתמונה — `photoSheet` ב-`js/screen-nutrition.js` היה קיים ומחובר מההתחלה
  (`ai.analyzeMealPhoto`); מה שחסר היה עיצוב — הוחלף ה-`<input type=file>` הגולמי בכפתור
  מרובע מעוצב (`.photo-pick`, גם ב-`screen-body.js` לתמונת התקדמות), והתמונה נשארת על
  המסך גם כשהניתוח נכשל (במקום להיעלם עם השגיאה).

## מה פתוח

1. להגדיר `ANTHROPIC_API_KEY` ב-Netlify כדי שהמאמן וזיהוי הקלוריות מתמונה יעבדו בפרודקשן
   (כרגע רק מפתח אישי מהמשתמש עובד). זה דורש גישה לחשבון ה-Netlify של הפרויקט ולא בוצע.

## בדיקות

```bash
node tools/serve.mjs &            # COACH=1 כדי לדמות את הפונקציות
node tools/e2e.mjs                # e2e.mjs .. e2e9.mjs — 10 חבילות, כולן עוברות
node tools/audit.mjs              # סופר כפתורים לכל מסך (שמירה על ממשק רזה)
```

## מגבלות סביבה שנתקלנו בהן

- הורדת GIF-ים של תרגילים מהאינטרנט חסומה (403 מהפרוקסי) — לכן הדמות מצוירת בקוד.
- אין להעתיק GIF-ים מאתרים מסחריים; הדמות ב-`figure.js` מקורית לחלוטין.
