const Database = require("better-sqlite3");

const db = new Database("work-hours.db");

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
        overtime_rate REAL DEFAULT 1.4
    )
`).run();

console.log("دیتابیس آماده است.");

const columns = db.prepare("PRAGMA table_info(work_hours)").all();

if (!columns.some(column => column.name === "work_minutes")) {
    db.prepare(`
        ALTER TABLE work_hours
        ADD COLUMN work_minutes INTEGER DEFAULT 0
    `).run();
}

if (!columns.some(column => column.name === "work_hours")) {
    db.prepare(`
        ALTER TABLE work_hours
        ADD COLUMN work_hours REAL DEFAULT 0
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


const company =
db.prepare(`
    SELECT * FROM company_settings
    WHERE id = 1
`).get();


if (!company) {

    db.prepare(`
        INSERT INTO company_settings
        (id, company_name, logo, manager_name)

        VALUES
        (1, 'نام شرکت شما', '', '')
    `).run();

}

console.log("دیتابیس آماده است.");