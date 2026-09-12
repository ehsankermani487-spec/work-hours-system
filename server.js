const express = require("express");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database("work-hours.db");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// =====================================================
// ساخت جدول کاربران
// =====================================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        employee_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
`).run();


// =====================================================
// ساخت بقیه‌ی جدول‌های دیتابیس (روی هاست تازه هم اجرا میشه)
// =====================================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS work_hours (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_name TEXT NOT NULL,
        work_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        overtime REAL DEFAULT 0,
        work_minutes INTEGER DEFAULT 0,
        work_hours REAL DEFAULT 0
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS deductions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_name TEXT NOT NULL,
        deduction_date TEXT NOT NULL,
        deduction_type TEXT NOT NULL,
        amount REAL DEFAULT 0,
        description TEXT
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        hourly_rate REAL DEFAULT 0,
        overtime_rate REAL DEFAULT 1.4,
        personnel_number TEXT
    )
`).run();

// اگر دیتابیس قبلاً بدون ستون شماره پرسنلی ساخته شده،
// همینجا به‌صورت خودکار اضافه‌اش می‌کنیم

const employeeColumns =
    db.prepare("PRAGMA table_info(employees)").all();

if (!employeeColumns.some(column => column.name === "personnel_number")) {

    db.prepare(`
        ALTER TABLE employees
        ADD COLUMN personnel_number TEXT
    `).run();

}

db.prepare(`
    CREATE TABLE IF NOT EXISTS company_settings (
        id INTEGER PRIMARY KEY,
        company_name TEXT DEFAULT 'نام شرکت شما',
        logo TEXT DEFAULT '',
        manager_name TEXT DEFAULT ''
    )
`).run();

const companySettings =
    db.prepare(`
        SELECT * FROM company_settings
        WHERE id = 1
    `).get();

if (!companySettings) {

    db.prepare(`
        INSERT INTO company_settings
        (id, company_name, logo, manager_name)
        VALUES (1, 'نام شرکت شما', '', '')
    `).run();

}


// =====================================================
// رمزنگاری رمز عبور
// =====================================================

function hashPassword(password) {

    return crypto
        .createHash("sha256")
        .update(password)
        .digest("hex");

}


// =====================================================
// ساخت حساب ادمین پیش‌فرض (فقط اگر هیچ کاربری وجود نداشته باشد)
// =====================================================

const userCount =
    db.prepare(`
        SELECT COUNT(*) AS count FROM users
    `).get().count;

if (userCount === 0) {

    db.prepare(`
        INSERT INTO users
        (username, password_hash, role)
        VALUES (?, ?, 'admin')
    `).run(
        "admin",
        hashPassword("admin123")
    );

    console.log(
        "⚠️  حساب ادمین پیش‌فرض ساخته شد — نام کاربری: admin — رمز عبور: admin123 — لطفاً هرچه سریع‌تر این رمز را تغییر دهید."
    );

}


// =====================================================
// نشست‌ها
// =====================================================

const sessions = new Map();


function createSession(user) {

    const token =
        crypto.randomBytes(32).toString("hex");

    sessions.set(token, {
        id: user.id,
        username: user.username,
        role: user.role,
        employee_id: user.employee_id || null
    });

    return token;

}


function getCurrentUser(req) {

    const token =
        req.headers.cookie
            ?.split(";")
            .map(x => x.trim())
            .find(x => x.startsWith("session="))
            ?.split("=")[1];

    if (!token) {
        return null;
    }

    return sessions.get(token) || null;

}


function requireLogin(req, res, next) {

    const user =
        getCurrentUser(req);

    if (!user) {

        if (req.path.startsWith("/api/")) {

            return res.status(401).json({
                message: "لطفاً ابتدا وارد حساب شوید."
            });

        }

        return res.redirect("/login.html");

    }

    req.user = user;

    next();

}


function requireAdmin(req, res, next) {

    const user =
        getCurrentUser(req);

    if (!user) {

        return res.status(401).json({
            message: "لطفاً وارد شوید."
        });

    }

    if (user.role !== "admin") {

        return res.status(403).json({
            message: "شما اجازه دسترسی به این بخش را ندارید."
        });

    }

    req.user = user;

    next();

}


// =====================================================
// صفحه‌ها
// =====================================================

app.get("/", (req, res) => {

    const user =
        getCurrentUser(req);

    if (!user) {

        return res.sendFile(
            path.join(__dirname, "public", "login.html")
        );

    }

    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );

});


const protectedPages = [
    "index.html",
    "work-hours.html",
    "salary.html",
    "payslip.html",
    "employees.html",
    "deductions.html",
    "company.html",
    "admin.html"
];


app.get("/:page", requireLogin, (req, res, next) => {

    if (!protectedPages.includes(req.params.page)) {
        return next();
    }

    const page =
        req.params.page;

    if (
        req.user.role !== "admin" &&
        (
            page === "employees.html" ||
            page === "deductions.html" ||
            page === "company.html" ||
            page === "admin.html"
        )
    ) {

        return res.status(403).send(`
            <html lang="fa" dir="rtl">
            <body style="font-family:tahoma;text-align:center;padding:80px">
                <h1>⛔ دسترسی غیرمجاز</h1>
                <p>شما اجازه ورود به این بخش را ندارید.</p>
                <a href="/index.html">بازگشت به داشبورد</a>
            </body>
            </html>
        `);

    }

    res.sendFile(
        path.join(__dirname, "public", page)
    );

});


// فایل‌های عمومی
app.use(express.static(path.join(__dirname, "public")));


// =====================================================
// ورود
// =====================================================

app.post("/api/login", (req, res) => {

    try {

        const {
            username,
            password
        } = req.body;

        if (!username || !password) {

            return res.status(400).json({
                message: "نام کاربری و رمز عبور را وارد کنید."
            });

        }

        const user =
            db.prepare(`
                SELECT *
                FROM users
                WHERE username = ?
            `).get(username.trim());

        if (!user) {

            return res.status(401).json({
                message: "نام کاربری یا رمز عبور اشتباه است."
            });

        }

        const passwordHash =
            hashPassword(password);

        if (passwordHash !== user.password_hash) {

            return res.status(401).json({
                message: "نام کاربری یا رمز عبور اشتباه است."
            });

        }

        const token =
            createSession(user);

        res.setHeader(
            "Set-Cookie",
            `session=${token}; HttpOnly; Path=/; SameSite=Lax`
        );

        res.json({
            message: "ورود موفق بود.",
            role: user.role
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "خطا در ورود."
        });

    }

});


// =====================================================
// خروج
// =====================================================

app.post("/api/logout", (req, res) => {

    const token =
        req.headers.cookie
            ?.split(";")
            .map(x => x.trim())
            .find(x => x.startsWith("session="))
            ?.split("=")[1];

    if (token) {
        sessions.delete(token);
    }

    res.setHeader(
        "Set-Cookie",
        "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
    );

    res.json({
        message: "خروج انجام شد."
    });

});


// =====================================================
// اطلاعات کاربر وارد شده
// =====================================================

app.get("/api/me", requireLogin, (req, res) => {

    let employee = null;

    if (
        req.user.role === "employee" &&
        req.user.employee_id
    ) {

        employee =
            db.prepare(`
                SELECT *
                FROM employees
                WHERE id = ?
            `).get(req.user.employee_id);

    }

    res.json({
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        employee
    });

});


// =====================================================
// ابزار محاسبه ساعت
// =====================================================

function calculateWorkHours(startTime, endTime) {

    const [startHour, startMinute] =
        startTime.split(":").map(Number);

    const [endHour, endMinute] =
        endTime.split(":").map(Number);

    let start =
        startHour * 60 + startMinute;

    let end =
        endHour * 60 + endMinute;

    if (end < start) {
        end += 24 * 60;
    }

    const totalMinutes =
        end - start;

    return {
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
        totalMinutes
    };

}


function validDate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
}


function validMonth(month) {
    return /^\d{4}-\d{2}$/.test(month);
}


// =====================================================
// ثبت ساعت کاری
// =====================================================

app.post("/api/work-hours", requireLogin, (req, res) => {

    try {

        let {
            employeeName,
            workDate,
            startTime,
            endTime
        } = req.body;


        // کارمند اجازه انتخاب فرد دیگر ندارد

        if (req.user.role === "employee") {

            if (!req.user.employee_id) {

                return res.status(403).json({
                    message: "برای این حساب کارمندی ثبت نشده است."
                });

            }

            const employee =
                db.prepare(`
                    SELECT *
                    FROM employees
                    WHERE id = ?
                `).get(req.user.employee_id);

            if (!employee) {

                return res.status(404).json({
                    message: "کارمند مربوط به حساب پیدا نشد."
                });

            }

            employeeName =
                employee.name;

        }


        if (
            !employeeName ||
            !workDate ||
            !startTime ||
            !endTime
        ) {

            return res.status(400).json({
                message: "اطلاعات کامل وارد نشده است."
            });

        }


        if (!validDate(workDate)) {

            return res.status(400).json({
                message: "فرمت تاریخ صحیح نیست."
            });

        }


        const employee =
            db.prepare(`
                SELECT *
                FROM employees
                WHERE name = ?
            `).get(employeeName);


        if (!employee) {

            return res.status(404).json({
                message: "کارمند پیدا نشد."
            });

        }


        const duration =
            calculateWorkHours(
                startTime,
                endTime
            );


        db.prepare(`
            INSERT INTO work_hours
            (
                employee_name,
                work_date,
                start_time,
                end_time,
                work_minutes,
                work_hours
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            employeeName,
            workDate,
            startTime,
            endTime,
            duration.totalMinutes,
            duration.totalMinutes / 60
        );


        res.json({
            message: "ساعت کاری با موفقیت ثبت شد."
        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "خطا در ثبت ساعت کاری."
        });

    }

});


// =====================================================
// دریافت ساعت کاری
// =====================================================

app.get("/api/work-hours", requireLogin, (req, res) => {

    try {

        const month =
            req.query.month;

        let records;

        if (req.user.role === "employee") {

            const employee =
                db.prepare(`
                    SELECT *
                    FROM employees
                    WHERE id = ?
                `).get(req.user.employee_id);

            if (!employee) {
                return res.json([]);
            }

            if (month) {

                records =
                    db.prepare(`
                        SELECT *
                        FROM work_hours
                        WHERE employee_name = ?
                        AND work_date LIKE ?
                        ORDER BY work_date DESC, id DESC
                    `).all(
                        employee.name,
                        `${month}-%`
                    );

            } else {

                records =
                    db.prepare(`
                        SELECT *
                        FROM work_hours
                        WHERE employee_name = ?
                        ORDER BY work_date DESC, id DESC
                    `).all(
                        employee.name
                    );

            }

        } else {

            if (month) {

                records =
                    db.prepare(`
                        SELECT *
                        FROM work_hours
                        WHERE work_date LIKE ?
                        ORDER BY work_date DESC, id DESC
                    `).all(
                        `${month}-%`
                    );

            } else {

                records =
                    db.prepare(`
                        SELECT *
                        FROM work_hours
                        ORDER BY work_date DESC, id DESC
                    `).all();

            }

        }

        res.json(records);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "خطا در دریافت ساعت کاری."
        });

    }

});


// =====================================================
// خلاصه ساعت کاری کارکنان (برای گزارش ادمین)
// =====================================================

app.get("/api/work-hours/summary", requireAdmin, (req, res) => {

    try {

        const month =
            req.query.month;

        let rows;

        if (month) {

            rows =
                db.prepare(`
                    SELECT
                        employee_name,
                        COUNT(DISTINCT work_date) AS work_days,
                        COALESCE(SUM(work_minutes), 0) AS total_minutes
                    FROM work_hours
                    WHERE work_date LIKE ?
                    GROUP BY employee_name
                    ORDER BY employee_name
                `).all(`${month}-%`);

        } else {

            rows =
                db.prepare(`
                    SELECT
                        employee_name,
                        COUNT(DISTINCT work_date) AS work_days,
                        COALESCE(SUM(work_minutes), 0) AS total_minutes
                    FROM work_hours
                    GROUP BY employee_name
                    ORDER BY employee_name
                `).all();

        }

        res.json(rows);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "خطا در دریافت خلاصه ساعت کاری."
        });

    }

});


// =====================================================
// کارکنان
// =====================================================

app.get("/api/employees", requireLogin, (req, res) => {

    try {

        // راننده فقط اطلاعات پایه خودش رو می‌بینه
        // نه لیست کامل کارکنان و نه حقوق ساعتی بقیه

        if (req.user.role !== "admin") {

            const employee =
                db.prepare(`
                    SELECT id, name, personnel_number
                    FROM employees
                    WHERE id = ?
                `).get(req.user.employee_id);

            return res.json(
                employee ? [employee] : []
            );

        }

        // ادمین لیست کامل کارکنان به همراه
        // نام کاربری حساب هرکدام (اگر ساخته شده باشد) را می‌بیند

        const employees =
            db.prepare(`
                SELECT
                    employees.*,
                    users.username AS username
                FROM employees
                LEFT JOIN users
                    ON users.employee_id = employees.id
                ORDER BY employees.name
            `).all();

        res.json(employees);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "خطا در دریافت لیست کارکنان."
        });

    }

});


app.post("/api/employees", requireAdmin, (req, res) => {

    try {

        const {
            name,
            hourlyRate,
            overtimeRate,
            personnelNumber,
            username,
            password
        } = req.body;


        if (!name || !hourlyRate) {

            return res.status(400).json({
                message: "نام و حقوق ساعتی الزامی است."
            });

        }


        const result =
            db.prepare(`
                INSERT INTO employees
                (
                    name,
                    hourly_rate,
                    overtime_rate,
                    personnel_number
                )
                VALUES (?, ?, ?, ?)
            `).run(
                name.trim(),
                Number(hourlyRate),
                Number(overtimeRate || 1.4),
                personnelNumber || null
            );


        const employeeId =
            result.lastInsertRowid;


        // اگر نام کاربری و رمز وارد شده باشد
        // حساب کارمند هم ساخته می‌شود

        if (username && password) {

            db.prepare(`
                INSERT INTO users
                (
                    username,
                    password_hash,
                    role,
                    employee_id
                )
                VALUES (?, ?, 'employee', ?)
            `).run(
                username.trim(),
                hashPassword(password),
                employeeId
            );

        }


        res.json({
            message: "کارمند با موفقیت ثبت شد.",
            id: employeeId
        });


    } catch (error) {

        console.error(error);

        res.status(400).json({
            message:
                "کارمند یا نام کاربری تکراری است."
        });

    }

});


// =====================================================
// ساخت حساب برای کارمند موجود
// =====================================================

app.post(
    "/api/employees/:id/account",
    requireAdmin,
    (req, res) => {

        try {

            const id =
                req.params.id;

            const {
                username,
                password
            } = req.body;


            if (!username || !password) {

                return res.status(400).json({
                    message:
                        "نام کاربری و رمز عبور الزامی است."
                });

            }


            const employee =
                db.prepare(`
                    SELECT *
                    FROM employees
                    WHERE id = ?
                `).get(id);


            if (!employee) {

                return res.status(404).json({
                    message:
                        "کارمند پیدا نشد."
                });

            }


            db.prepare(`
                INSERT INTO users
                (
                    username,
                    password_hash,
                    role,
                    employee_id
                )
                VALUES (?, ?, 'employee', ?)
            `).run(
                username.trim(),
                hashPassword(password),
                id
            );


            res.json({
                message:
                    "حساب کاربری ساخته شد."
            });


        } catch (error) {

            console.error(error);

            res.status(400).json({
                message:
                    "این نام کاربری قبلاً استفاده شده است."
            });

        }

    }
);


// =====================================================
// بازنشانی رمز عبور حساب کارمند
// =====================================================

app.put(
    "/api/employees/:id/account",
    requireAdmin,
    (req, res) => {

        try {

            const id =
                req.params.id;

            const {
                password
            } = req.body;


            if (!password) {

                return res.status(400).json({
                    message:
                        "رمز عبور جدید را وارد کنید."
                });

            }


            const result =
                db.prepare(`
                    UPDATE users
                    SET password_hash = ?
                    WHERE employee_id = ?
                `).run(
                    hashPassword(password),
                    id
                );


            if (result.changes === 0) {

                return res.status(404).json({
                    message:
                        "این کارمند هنوز حساب کاربری ندارد."
                });

            }


            res.json({
                message:
                    "رمز عبور با موفقیت تغییر کرد."
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "خطا در تغییر رمز عبور."
            });

        }

    }
);


// =====================================================
// ویرایش کارمند
// =====================================================

app.put(
    "/api/employees/:id",
    requireAdmin,
    (req, res) => {

        try {

            const id =
                req.params.id;

            const {
                name,
                hourlyRate,
                overtimeRate,
                personnelNumber
            } = req.body;


            db.prepare(`
                UPDATE employees

                SET
                    name = ?,
                    hourly_rate = ?,
                    overtime_rate = ?,
                    personnel_number = ?

                WHERE id = ?
            `).run(
                name,
                Number(hourlyRate),
                Number(overtimeRate || 1.4),
                personnelNumber || null,
                id
            );


            res.json({
                message:
                    "اطلاعات کارمند ویرایش شد."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "خطا در ویرایش کارمند."
            });

        }

    }
);


// =====================================================
// حذف کارمند
// =====================================================

app.delete(
    "/api/employees/:id",
    requireAdmin,
    (req, res) => {

        try {

            const id =
                req.params.id;


            db.prepare(`
                DELETE FROM users
                WHERE employee_id = ?
            `).run(id);


            db.prepare(`
                DELETE FROM employees
                WHERE id = ?
            `).run(id);


            res.json({
                message:
                    "کارمند حذف شد."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "خطا در حذف کارمند."
            });

        }

    }
);


// =====================================================
// کسورات
// =====================================================

(
    "/api/deductions",
    requireAdmin,
    (req, res) => {

        try {

            const deductions =
                db.prepare(`
                    SELECT *
                    FROM deductions
                    ORDER BY id DESC
                `).all();

            res.json(deductions);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "خطا در دریافت کسورات."
            });

        }

    }
);


app.post(
    "/api/deductions",
    requireAdmin,
    (req, res) => {

        try {

            const {
                employee_name,
                deduction_date,
                deduction_type,
                amount,
                description
            } = req.body;


            if (
                !employee_name ||
                !deduction_date ||
                !deduction_type ||
                !amount
            ) {

                return res.status(400).json({
                    message:
                        "اطلاعات کامل وارد نشده است."
                });

            }


            db.prepare(`
                INSERT INTO deductions
                (
                    employee_name,
                    deduction_date,
                    deduction_type,
                    amount,
                    description
                )
                VALUES (?, ?, ?, ?, ?)
            `).run(
                employee_name,
                deduction_date,
                deduction_type,
                Number(amount),
                description || ""
            );


            res.json({
                message:
                    "کسری با موفقیت ثبت شد."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "خطا در ثبت کسری."
            });

        }

    }
);


// =====================================================
// حقوق ماهانه
// =====================================================

app.get(
    "/api/salary",
    requireLogin,
    (req, res) => {

        try {

            const month =
                req.query.month;


            if (!month) {

                return res.status(400).json({
                    message:
                        "ماه وارد نشده است."
                });

            }


            let salaries;


            if (req.user.role === "employee") {

                const employee =
                    db.prepare(`
                        SELECT *
                        FROM employees
                        WHERE id = ?
                    `).get(req.user.employee_id);


                if (!employee) {

                    return res.json([]);

                }


                salaries =
                    db.prepare(`
                        SELECT

                            e.id,
                            e.name,
                            e.hourly_rate,

                            COALESCE(
                                SUM(w.work_minutes),
                                0
                            ) AS total_minutes

                        FROM employees e

                        LEFT JOIN work_hours w

                        ON e.name = w.employee_name

                        AND w.work_date LIKE ?

                        WHERE e.id = ?

                        GROUP BY
                            e.id,
                            e.name,
                            e.hourly_rate
                    `).all(
                        `${month}-%`,
                        employee.id
                    );

            } else {

                salaries =
                    db.prepare(`
                        SELECT

                            e.id,
                            e.name,
                            e.hourly_rate,

                            COALESCE(
                                SUM(w.work_minutes),
                                0
                            ) AS total_minutes

                        FROM employees e

                        LEFT JOIN work_hours w

                        ON e.name = w.employee_name

                        AND w.work_date LIKE ?

                        GROUP BY
                            e.id,
                            e.name,
                            e.hourly_rate

                        ORDER BY e.name
                    `).all(
                        `${month}-%`
                    );

            }


            const result =
                salaries.map(item => {

                    const totalHours =
                        item.total_minutes / 60;

                    const baseSalary =
                        totalHours *
                        Number(
                            item.hourly_rate || 0
                        );


                    const deduction =
                        db.prepare(`
                            SELECT
                                COALESCE(
                                    SUM(amount),
                                    0
                                ) AS total

                            FROM deductions

                            WHERE employee_name = ?

                            AND deduction_date LIKE ?
                        `).get(
                            item.name,
                            `${month}-%`
                        ).total;


                    const finalSalary =
                        baseSalary -
                        Number(deduction || 0);


                    return {

                        id: item.id,

                        name: item.name,

                        total_hours:
                            Number(
                                totalHours.toFixed(2)
                            ),

                        hourly_rate:
                            Number(
                                item.hourly_rate || 0
                            ),

                        base_salary:
                            Math.round(baseSalary),

                        deductions:
                            Math.round(
                                Number(deduction || 0)
                            ),

                        final_salary:
                            Math.round(finalSalary)

                    };

                });


            res.json(result);


        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "خطا در محاسبه حقوق."
            });

        }

    }
);


// =====================================================
// فیش حقوقی
// =====================================================

app.get(
    "/api/payslip",
    requireLogin,
    (req, res) => {

        try {

            const employeeName =
                req.query.employee;

            const month =
                req.query.month;


            if (!month) {

                return res.status(400).json({
                    message:
                        "ماه لازم است."
                });

            }


            let employee;


            if (req.user.role === "employee") {

                employee =
                    db.prepare(`
                        SELECT *
                        FROM employees
                        WHERE id = ?
                    `).get(
                        req.user.employee_id
                    );


                if (!employee) {

                    return res.status(404).json({
                        message:
                            "کارمند پیدا نشد."
                    });

                }

            } else {

                employee =
                    db.prepare(`
                        SELECT *
                        FROM employees
                        WHERE name = ?
                    `).get(employeeName);

            }


            if (!employee) {

                return res.status(404).json({
                    message:
                        "کارمند پیدا نشد."
                });

            }


            const salary =
                db.prepare(`
                    SELECT

                        COALESCE(
                            SUM(work_minutes),
                            0
                        ) AS total_minutes

                    FROM work_hours

                    WHERE employee_name = ?

                    AND work_date LIKE ?
                `).get(
                    employee.name,
                    `${month}-%`
                );


            const totalHours =
                salary.total_minutes / 60;


            const baseSalary =
                totalHours *
                Number(employee.hourly_rate || 0);


            const deductions =
                db.prepare(`
                    SELECT
                        COALESCE(
                            SUM(amount),
                            0
                        ) AS total

                    FROM deductions

                    WHERE employee_name = ?

                    AND deduction_date LIKE ?
                `).get(
                    employee.name,
                    `${month}-%`
                ).total;


            const finalSalary =
                baseSalary -
                Number(deductions || 0);


            res.json({

                name:
                    employee.name,

                personnel_number:
                    employee.personnel_number || "",

                total_hours:
                    Number(
                        totalHours.toFixed(2)
                    ),

                hourly_rate:
                    Number(
                        employee.hourly_rate || 0
                    ),

                base_salary:
                    Math.round(baseSalary),

                deductions:
                    Math.round(
                        Number(deductions || 0)
                    ),

                final_salary:
                    Math.round(finalSalary)

            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "خطا در دریافت فیش."
            });

        }

    }
);


// =====================================================
// شرکت
// =====================================================

app.get(
    "/api/company",
    requireAdmin,
    (req, res) => {

        try {

            const company =
                db.prepare(`
                    SELECT *
                    FROM company_settings
                    WHERE id = 1
                `).get();


            res.json(company || {});

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "خطا در دریافت اطلاعات شرکت."
            });

        }

    }
);


app.post(
    "/api/company",
    requireAdmin,
    (req, res) => {

        try {

            const {
                company_name,
                manager_name,
                logo
            } = req.body;


            db.prepare(`
                UPDATE company_settings

                SET
                    company_name = ?,
                    manager_name = ?,
                    logo = ?

                WHERE id = 1
            `).run(
                company_name || "",
                manager_name || "",
                logo || ""
            );


            res.json({
                message:
                    "تنظیمات شرکت ذخیره شد."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "خطا در ذخیره تنظیمات شرکت."
            });

        }

    }
);


// =====================================================
// ساخت حساب مدیر اولیه
// =====================================================

const adminExists =
    db.prepare(`
        SELECT *
        FROM users
        WHERE role = 'admin'
        LIMIT 1
    `).get();


if (!adminExists) {

    db.prepare(`
        INSERT INTO users
        (
            username,
            password_hash,
            role
        )
        VALUES (?, ?, 'admin')
    `).run(
        "admin",
        hashPassword("123456")
    );

    console.log(
        "حساب مدیر اولیه ساخته شد:"
    );

    console.log(
        "نام کاربری: admin"
    );

    console.log(
        "رمز عبور: 123456"
    );

}


// =====================================================
// اجرای سرور
// =====================================================

app.listen(PORT, () => {

    console.log(
        `سرور روی پورت ${PORT} اجرا شد.`
    );

    console.log(
        `http://localhost:${PORT}`
    );

});