# RantIt

RantIt is a platform where users can share their thoughts, opinions, or rants freely. Users can post rants, reply to others, and engage in discussions. The platform also includes an automated moderation system using AI.

## Setup

### 1. Install Dependencies
```sh
npm install
```

### 2. Install Python Requirements
```sh
pip install -r requirements.txt
```

### 3. Configure Environment Variables
Create a `.env` file with the following template:

```env
# ✅ Database Credentials
DB_USER=postgres
DB_HOST=localhost
DB_NAME=// 
DB_PASSWORD=// 
DB_PORT=5432

# ✅ Email Credentials (For Verification)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=// 
EMAIL_PASS=// 

# ✅ Google OAuth Credentials
GOOGLE_CLIENT_ID=// 
GOOGLE_CLIENT_SECRET=// 
GOOGLE_CALLBACK_URL=// 
PERSPECTIVE_API_KEY=// 
```

## Database Setup
Run the following SQL queries to set up the database tables:

### 1. Users Table
```sql
CREATE TABLE public.users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified BOOLEAN DEFAULT false,
    verification_token TEXT,
    alias VARCHAR(50) UNIQUE
);
```

### 2. Rants Table
```sql
CREATE TABLE public.rants (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    tags VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT fk_rants_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE
);
```

### 3. Replies Table
```sql
CREATE TABLE public.replies (
    id SERIAL PRIMARY KEY,
    rant_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_reply_id INTEGER,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    FOREIGN KEY (rant_id) REFERENCES public.rants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_reply_id) REFERENCES public.replies(id) ON DELETE CASCADE
);
```

### 4. Deleted Rants Table
```sql
CREATE TABLE deleted_rants (
    id SERIAL PRIMARY KEY,
    user_id INT,
    title VARCHAR(255),
    content TEXT,
    tags VARCHAR,
    deleted_at TIMESTAMP WITHOUT TIME ZONE
);
```

### 5. Deleted Replies Table
```sql
CREATE TABLE deleted_replies (
    id SERIAL PRIMARY KEY,
    original_reply_id INT,
    rant_id INT,
    user_id INT,
    parent_reply_id INT,
    content TEXT,
    deleted_at TIMESTAMP WITHOUT TIME ZONE
);
```

## Starting the Project

Run the following commands to start the backend and moderation system:

### 1. Start the Node.js server
```sh
node index.js
```

### 2. Start the Python moderation API
```sh
python moderate.py
```

## 🛠️ Features

- User Authentication (Email & Google OAuth)
- Anonymous & Public Rants
- AI-Powered Moderation
- Reply & Threaded Discussions
- Simple UI with EJS

## 📜 License

This project is for personal learning and portfolio purposes. Feel free to fork and modify it! You are also welcome to contribute and make it better. 🚀 **Happy Ranting!**
