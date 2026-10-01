const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();

// ======================================
// تنظیمات سرور و دیتابیس
// ======================================

app.use(express.json());

const dbPath =
    process.env.DB_PATH ||
    path.join(__dirname, "work-hours.db");

// ساخت پوشه دیتابیس در صورت نبودن
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// اتصال به دیتابیس
const db = new Database(dbPath);

// ======================================
// فایل‌های سایت
// ======================================

app.use(express.static(path.join(__dirname, "public")));

// ======================================
// محاسبه مدت ساعت کاری
// ======================================

function calculateWorkHours(startTime, endTime) {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    let start = startHour * 60 + startMinute;
    let end = endHour * 60 + endMinute;

    // پشتیبانی از شیفتی که از نیمه‌شب عبور می‌کند
    if (end < start) {
        end += 24 * 60;
    }

    const totalMinutes = end - start;

    return {
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60,
        totalMinutes
    };
}

// ======================================
// ثبت ساعت کاری
// ======================================

app.post("/api/work-hours", (req, res) => {
    try {
        const {
            employeeName,
            workDate,
            startTime,
            endTime
        } = req.body;

        if (!employeeName || !workDate || !startTime || !endTime) {
            return res.status(400).json({
                message: "اطلاعات ساعت کاری کامل نیست."
            });
        }

        const workDuration = calculateWorkHours(
            startTime,
            endTime
        );

        const insert = db.prepare(`
            INSERT INTO work_hours
            (
                employee_name,
                work_date,
                start_time,
                end_time,
                overtime,
                work_minutes,
                work_hours
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insert.run(
            employeeName,
            workDate,
            startTime,
            endTime,
            0,
            workDuration.totalMinutes,
            workDuration.totalMinutes / 60
        );

        res.json({
            message: "ساعت کاری با موفقیت ذخیره شد."
        });

    } catch (error) {
        console.error("خطا در ثبت ساعت کاری:", error);

        res.status(500).json({
            message: "خطا در ثبت ساعت کاری."
        });
    }
});

// ======================================
// دریافت ساعت‌های کاری
// ======================================

app.get("/api/work-hours", (req, res) => {
    try {
        const month = req.query.month;
        let records;

        if (month) {
            records = db.prepare(`
                SELECT *
                FROM work_hours
                WHERE work_date LIKE ?
                ORDER BY work_date DESC, id DESC
            `).all(`${month}-%`);
        } else {
            records = db.prepare(`
                SELECT *
                FROM work_hours
                ORDER BY work_date DESC, id DESC
            `).all();
        }

        res.json(records);

    } catch (error) {
        console.error("خطا در دریافت ساعت کاری:", error);

        res.status(500).json({
            message: "خطا در دریافت ساعت کاری."
        });
    }
});

// ======================================
// خلاصه ساعت کاری
// ======================================

app.get("/api/work-hours/summary", (req, res) => {
    try {
        const month = req.query.month;
        let summary;

        if (month) {
            summary = db.prepare(`
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
            summary = db.prepare(`
                SELECT
                    employee_name,
                    COUNT(DISTINCT work_date) AS work_days,
                    COALESCE(SUM(work_minutes), 0) AS total_minutes
                FROM work_hours
                GROUP BY employee_name
                ORDER BY employee_name
            `).all();
        }

        res.json(summary);

    } catch (error) {
        console.error("خطا در خلاصه ساعت کاری:", error);

        res.status(500).json({
            message: "خطا در دریافت خلاصه ساعت کاری."
        });
    }
});

// ======================================
// دریافت فهرست کارکنان
// ======================================

app.get("/api/employees", (req, res) => {
    try {
        const employees = db.prepare(`
            SELECT
                id,
                personnel_number,
                name,
                hourly_rate
            FROM employees
            ORDER BY name
        `).all();

        res.json(employees);

    } catch (error) {
        console.error("خطا در دریافت کارکنان:", error);

        res.status(500).json({
            message: "خطا در دریافت لیست کارکنان."
        });
    }
});

// ======================================
// ثبت کارمند جدید
// ======================================

app.post("/api/employees", (req, res) => {
    try {
        const {
            personnelNumber,
            name,
            hourlyRate
        } = req.body;

        if (
            !personnelNumber ||
            !name ||
            hourlyRate === undefined ||
            hourlyRate === null ||
            hourlyRate === ""
        ) {
            return res.status(400).json({
                message: "شماره پرسنلی، نام و حقوق ساعتی الزامی است."
            });
        }

        const rate = Number(hourlyRate);

        if (!Number.isFinite(rate) || rate < 0) {
            return res.status(400).json({
                message: "حقوق ساعتی معتبر نیست."
            });
        }

        const result = db.prepare(`
            INSERT INTO employees
            (
                personnel_number,
                name,
                hourly_rate,
                overtime_rate
            )
            VALUES (?, ?, ?, ?)
        `).run(
            String(personnelNumber).trim(),
            String(name).trim(),
            rate,
            1
        );

        res.json({
            message: "کارمند با موفقیت ثبت شد.",
            id: result.lastInsertRowid
        });

    } catch (error) {
        console.error("خطا در ثبت کارمند:", error);

        res.status(400).json({
            message: "ثبت کارمند انجام نشد. ممکن است شماره پرسنلی تکراری باشد."
        });
    }
});

// ======================================
// ویرایش کارمند
// ======================================

app.put("/api/employees/:id", (req, res) => {
    try {
        const id = Number(req.params.id);

        const {
            personnelNumber,
            name,
            hourlyRate
        } = req.body;

        if (
            !personnelNumber ||
            !name ||
            hourlyRate === undefined ||
            hourlyRate === null ||
            hourlyRate === ""
        ) {
            return res.status(400).json({
                message: "شماره پرسنلی، نام و حقوق ساعتی الزامی است."
            });
        }

        const rate = Number(hourlyRate);

        if (
            !Number.isInteger(id) ||
            !Number.isFinite(rate) ||
            rate < 0
        ) {
            return res.status(400).json({
                message: "اطلاعات واردشده معتبر نیست."
            });
        }

        const result = db.prepare(`
            UPDATE employees
            SET
                personnel_number = ?,
                name = ?,
                hourly_rate = ?
            WHERE id = ?
        `).run(
            String(personnelNumber).trim(),
            String(name).trim(),
            rate,
            id
        );

        if (result.changes === 0) {
            return res.status(404).json({
                message: "کارمند پیدا نشد."
            });
        }

        res.json({
            message: "اطلاعات کارمند ویرایش شد."
        });

    } catch (error) {
        console.error("خطا در ویرایش کارمند:", error);

        res.status(400).json({
            message: "ویرایش کارمند انجام نشد."
        });
    }
});

// ======================================
// حذف کارمند
// ======================================

app.delete("/api/employees/:id", (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                message: "شناسه کارمند معتبر نیست."
            });
        }

        const result = db.prepare(`
            DELETE FROM employees
            WHERE id = ?
        `).run(id);

        if (result.changes === 0) {
            return res.status(404).json({
                message: "کارمند پیدا نشد."
            });
        }

        res.json({
            message: "کارمند حذف شد."
        });

    } catch (error) {
        console.error("خطا در حذف کارمند:", error);

        res.status(500).json({
            message: "حذف کارمند انجام نشد."
        });
    }
});

// ======================================
// دریافت کسورات
// ======================================

app.get("/api/deductions", (req, res) => {
    try {
        const deductions = db.prepare(`
            SELECT *
            FROM deductions
            ORDER BY id DESC
        `).all();

        res.json(deductions);

    } catch (error) {
        console.error("خطا در دریافت کسورات:", error);

        res.status(500).json({
            message: "خطا در دریافت کسورات."
        });
    }
});

// ======================================
// ثبت کسورات
// ======================================

app.post("/api/deductions", (req, res) => {
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
            amount === undefined ||
            amount === null ||
            amount === ""
        ) {
            return res.status(400).json({
                message: "اطلاعات کامل وارد نشده است."
            });
        }

        const numericAmount = Number(amount);

        if (
            !Number.isFinite(numericAmount) ||
            numericAmount < 0
        ) {
            return res.status(400).json({
                message: "مبلغ کسری معتبر نیست."
            });
        }

        const result = db.prepare(`
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
            numericAmount,
            description || ""
        );

        res.json({
            message: "کسری با موفقیت ثبت شد.",
            id: result.lastInsertRowid
        });

    } catch (error) {
        console.error("خطا در ثبت کسری:", error);

        res.status(500).json({
            message: "ثبت کسری انجام نشد."
        });
    }
});

// ======================================
// محاسبه حقوق ماهانه
// ======================================

app.get("/api/salary", (req, res) => {
    try {
        const month = req.query.month;

        if (!month) {
            return res.status(400).json({
                message: "ماه وارد نشده است."
            });
        }

        const salaries = db.prepare(`
            SELECT
                e.id,
                e.name,
                e.personnel_number,
                e.hourly_rate,
                COALESCE(SUM(w.work_minutes), 0) AS total_minutes
            FROM employees e
            LEFT JOIN work_hours w
                ON e.name = w.employee_name
                AND w.work_date LIKE ?
            GROUP BY
                e.id,
                e.name,
                e.personnel_number,
                e.hourly_rate
            ORDER BY e.name
        `).all(`${month}-%`);

        const result = salaries.map(item => {
            const totalHours = item.total_minutes / 60;
            const baseSalary = totalHours * item.hourly_rate;

            const deduction = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) AS total
                FROM deductions
                WHERE employee_name = ?
                AND deduction_date LIKE ?
            `).get(
                item.name,
                `${month}-%`
            ).total;

            return {
                id: item.id,
                name: item.name,
                personnel_number: item.personnel_number || "",
                total_hours: Number(totalHours.toFixed(2)),
                hourly_rate: item.hourly_rate,
                base_salary: baseSalary,
                deductions: deduction,
                final_salary: baseSalary - deduction
            };
        });

        res.json(result);

    } catch (error) {
        console.error("خطا در محاسبه حقوق:", error);

        res.status(500).json({
            message: "خطا در محاسبه حقوق."
        });
    }
});

// ======================================
// فیش حقوقی کارمند
// ======================================

app.get("/api/payslip", (req, res) => {
    try {
        const employee = req.query.employee;
        const month = req.query.month;

        if (!employee || !month) {
            return res.status(400).json({
                message: "نام کارمند و ماه لازم است."
            });
        }

        const salary = db.prepare(`
            SELECT
                e.id,
                e.name,
                e.personnel_number,
                e.hourly_rate,
                COALESCE(SUM(w.work_minutes), 0) AS total_minutes,
                COUNT(DISTINCT w.work_date) AS work_days
            FROM employees e
            LEFT JOIN work_hours w
                ON e.name = w.employee_name
                AND w.work_date LIKE ?
            WHERE e.name = ?
            GROUP BY
                e.id,
                e.name,
                e.personnel_number,
                e.hourly_rate
        `).get(
            `${month}-%`,
            employee
        );

        if (!salary) {
            return res.status(404).json({
                message: "کارمند پیدا نشد."
            });
        }

        const totalHours = salary.total_minutes / 60;
        const baseSalary = totalHours * salary.hourly_rate;

        const deductions = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM deductions
            WHERE employee_name = ?
            AND deduction_date LIKE ?
        `).get(
            employee,
            `${month}-%`
        ).total;

        const finalSalary = baseSalary - deductions;

        res.json({
            name: salary.name,
            personnel_number: salary.personnel_number || "",
            work_days: salary.work_days,
            total_hours: Number(totalHours.toFixed(2)),
            hourly_rate: salary.hourly_rate,
            base_salary: baseSalary,
            deductions,
            final_salary: finalSalary
        });

    } catch (error) {
        console.error("خطا در دریافت فیش حقوقی:", error);

        res.status(500).json({
            message: "خطا در دریافت فیش حقوقی."
        });
    }
});

// ======================================
// دریافت تنظیمات شرکت
// ======================================

app.get("/api/company", (req, res) => {
    try {
        const company = db.prepare(`
            SELECT *
            FROM company_settings
            WHERE id = 1
        `).get();

        res.json(company || {});

    } catch (error) {
        console.error("خطا در دریافت تنظیمات شرکت:", error);

        res.status(500).json({
            message: "خطا در دریافت تنظیمات شرکت."
        });
    }
});

// ======================================
// ذخیره تنظیمات شرکت
// ======================================

app.post("/api/company", (req, res) => {
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
            message: "تنظیمات شرکت ذخیره شد."
        });

    } catch (error) {
        console.error("خطا در ذخیره تنظیمات شرکت:", error);

        res.status(500).json({
            message: "ذخیره تنظیمات شرکت انجام نشد."
        });
    }
});

// ======================================
// اجرای سرور
// ======================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`سرور روی پورت ${PORT} اجرا شد.`);
    console.log(`مسیر دیتابیس: ${dbPath}`);
});
