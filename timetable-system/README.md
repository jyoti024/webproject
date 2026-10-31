# CampusClock - College Timetable Management System

Full stack web app. **Backend:** Node.js + Express. **Frontend:** HTML, CSS, React (Vite).
**Storage:** one Excel workbook, `backend/data/timetable.xlsx` (created automatically on first start).
**Logins:** separate **User** and **Admin** sign-in.

## Run it

Terminal 1 - backend
```
cd backend
npm install
npm start          # http://localhost:5000
```

Terminal 2 - frontend
```
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Open http://localhost:5173.

**First admin login:** `admin` / `admin123` (change it from the key icon in the sidebar, or set
`ADMIN_USER`, `ADMIN_PASS` and `JWT_SECRET` environment variables before the first start).

## Quick demo
Sign in as admin -> Dashboard -> **Load sample college**. This fills the Excel file with teachers,
subjects, classes, rooms and a full timetable, and creates two demo user logins:
`student / student123` (class CSE-3A) and `faculty / faculty123` (Dr. Anita Rao).

## Roles
| | User | Admin |
|---|---|---|
| Dashboard (personal schedule, next lecture) | yes | yes (college-wide) |
| View timetable, download PDF | yes | yes |
| Add / edit lectures, teachers, subjects, classes, rooms | no | yes |
| Manage users, download / reload Excel | no | yes |

Users can create their own account on the sign-in page with their full name and password (Student or Faculty, linked to their class or name). Their full name is used to sign in; existing accounts can continue using their username.
Admin accounts can only be created by another admin.

## The Excel file
`backend/data/timetable.xlsx` has these sheets: **Teachers, Subjects, Classes, Rooms, Timetable, Users**
and a read-only **Weekly Grid** (a colour-coded timetable per class).

You can edit the file in Excel: add rows, change names, add users. Then click **Reload** in the app sidebar.
- Names must be unique inside each sheet; the Timetable sheet refers to classes, subjects, teachers and rooms by name.
- To add or reset a login in Excel, type a plain password into the **Set Password** column of the Users sheet and click Reload. It is hashed and the cell is cleared.
- Close the file in Excel before saving from the app, otherwise Windows blocks the write and the app shows a message (nothing is lost).

## Rules checked automatically
Same class / teacher / room twice in one period, teacher leave days, daily and weekly teacher limits,
Lab subject in a Theory room, class bigger than the room, room closed days / opening periods.
Warnings: a teacher's last allowed lecture, 3 or more lectures in a row.

## API (all need a token except login, register and public/options)
POST /api/login, /api/register - GET /api/public/options, /api/me - POST /api/me/password
GET /api/config, /api/teachers, /api/rooms, /api/classes, /api/subjects, /api/slots
POST, PUT /:id, DELETE /:id on each resource and /api/users (admin)
POST /api/slots/check (dry run) - GET /api/storage/info, /api/storage/download - POST /api/storage/reload, /api/storage/sample
