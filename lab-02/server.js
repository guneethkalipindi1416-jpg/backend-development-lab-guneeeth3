/**
 * Lab 2: SQLite database and CRUD routes
 * Course: Backend Development Fundamentals (Year II Term II)
 * Faculty: Joel Prashanth D
 * Student: Guneeth Kalipindi (RA2311003010000)
 *
 * Description:
 * Express server connected to SQLite database (goodreads.db)
 * exposing full CRUD endpoints for the 'book' resource.
 * Supports local execution and serverless hosting (e.g. Vercel).
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve DB path (copy to /tmp on Vercel to allow write operations on serverless)
const localDbPath = path.join(__dirname, 'goodreads.db');
let dbPath = localDbPath;

// Middleware to parse incoming JSON request bodies
app.use(express.json());

// Middleware: Request Logger with Status Code Logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.originalUrl} -> HTTP ${res.statusCode} (${duration}ms)`);
  });
  next();
});

let db = null;
let dbPromise = null;

/**
 * Safe database connection resolver
 * Guarantees the database is open before handling any query.
 * Auto-seeds /tmp/goodreads.db on serverless environments if needed.
 */
const getDB = async () => {
  if (db) return db;
  if (!dbPromise) {
    dbPromise = (async () => {
      if (process.env.VERCEL) {
        const tmpDbPath = path.join('/tmp', 'goodreads.db');
        try {
          if (!fs.existsSync(tmpDbPath) && fs.existsSync(localDbPath)) {
            fs.copyFileSync(localDbPath, tmpDbPath);
            dbPath = tmpDbPath;
          } else if (fs.existsSync(tmpDbPath)) {
            dbPath = tmpDbPath;
          }
        } catch (e) {
          console.warn('Using fallback dbPath:', e.message);
        }
      }

      const database = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });

      // Ensure table exists
      await database.exec(`
        CREATE TABLE IF NOT EXISTS book (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          author TEXT NOT NULL,
          price INTEGER NOT NULL,
          pages INTEGER NOT NULL
        );
      `);

      // Ensure seed data exists if table is empty
      const count = await database.get('SELECT COUNT(*) AS total FROM book;');
      if (count && count.total === 0) {
        const initialBooks = [
          [1, 'The Great Gatsby', 'F. Scott Fitzgerald', 450, 180],
          [2, 'To Kill a Mockingbird', 'Harper Lee', 520, 281],
          [3, '1984', 'George Orwell', 399, 328],
          [4, 'Pride and Prejudice', 'Jane Austen', 350, 279],
          [5, 'The Catcher in the Rye', 'J.D. Salinger', 420, 214],
          [6, 'The Hobbit', 'J.R.R. Tolkien', 599, 310],
          [7, 'Fahrenheit 451', 'Ray Bradbury', 380, 249],
          [8, 'Brave New World', 'Aldous Huxley', 410, 268],
          [9, 'Crime and Punishment', 'Fyodor Dostoevsky', 650, 671],
          [10, 'The Alchemist', 'Paulo Coelho', 299, 208]
        ];
        for (const b of initialBooks) {
          await database.run(
            'INSERT INTO book (id, title, author, price, pages) VALUES (?, ?, ?, ?, ?);',
            b
          );
        }
      }

      return database;
    })();
  }
  db = await dbPromise;
  return db;
};

/**
 * Task 3: initializeDBAndServer()
 * Asynchronous function that initializes the SQLite database connection
 * and only starts the Express server after the database connection succeeds.
 */
const initializeDBAndServer = async () => {
  try {
    await getDB();

    // Listen when running locally (not in Vercel serverless)
    if (!process.env.VERCEL) {
      app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`🚀 Server Running at: http://localhost:${PORT}/`);
        console.log(`Connected to SQLite Database: ${dbPath}`);
        console.log(`Available Endpoints:`);
        console.log(`  - GET    /books/          (Fetch all books)`);
        console.log(`  - GET    /books/:bookId/  (Fetch single book by ID)`);
        console.log(`  - POST   /books/          (Add new book)`);
        console.log(`  - PUT    /books/:bookId/  (Update book by ID)`);
        console.log(`  - DELETE /books/:bookId/  (Remove book by ID)`);
        console.log(`=======================================================`);
      });
    }
  } catch (error) {
    console.error(`Database Connection Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// ==========================================
// CRUD Routes for 'book' resource (Tasks 4 & 5)
// ==========================================

/**
 * Route 1: GET /books/
 * Retrieves all books from the database.
 */
app.get('/books/', async (req, res) => {
  try {
    const database = await getDB();
    const getBooksQuery = `
      SELECT
        id,
        title,
        author,
        price,
        pages
      FROM
        book
      ORDER BY
        id ASC;
    `;
    const booksArray = await database.all(getBooksQuery);
    res.status(200).json(booksArray);
  } catch (error) {
    console.error('Error in GET /books/:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Route 2: GET /books/:bookId/
 * Retrieves a single book by ID using a parameterized query (?).
 */
app.get('/books/:bookId/', async (req, res) => {
  try {
    const database = await getDB();
    const { bookId } = req.params;
    const getBookQuery = `
      SELECT
        id,
        title,
        author,
        price,
        pages
      FROM
        book
      WHERE
        id = ?;
    `;
    const book = await database.get(getBookQuery, [bookId]);

    if (!book) {
      return res.status(404).json({ error: `Book with id ${bookId} not found` });
    }

    res.status(200).json(book);
  } catch (error) {
    console.error(`Error in GET /books/${req.params.bookId}:`, error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Route 3: POST /books/
 * Creates a new book entry in the database using parameterized queries (?).
 */
app.post('/books/', async (req, res) => {
  try {
    const database = await getDB();
    const { title, author, price, pages } = req.body;

    if (!title || !author || price === undefined || pages === undefined) {
      return res.status(400).json({
        error: 'Validation Error: title, author, price, and pages are all required fields.'
      });
    }

    const addBookQuery = `
      INSERT INTO
        book (title, author, price, pages)
      VALUES
        (?, ?, ?, ?);
    `;

    const dbResponse = await database.run(addBookQuery, [title, author, price, pages]);
    const bookId = dbResponse.lastID;

    res.status(201).json({
      message: 'Book Added Successfully',
      bookId: bookId
    });
  } catch (error) {
    console.error('Error in POST /books/:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Route 4: PUT /books/:bookId/
 * Updates existing book details using parameterized queries (?).
 */
app.put('/books/:bookId/', async (req, res) => {
  try {
    const database = await getDB();
    const { bookId } = req.params;
    const { title, author, price, pages } = req.body;

    if (!title || !author || price === undefined || pages === undefined) {
      return res.status(400).json({
        error: 'Validation Error: title, author, price, and pages are all required fields.'
      });
    }

    const updateBookQuery = `
      UPDATE
        book
      SET
        title = ?,
        author = ?,
        price = ?,
        pages = ?
      WHERE
        id = ?;
    `;

    const dbResponse = await database.run(updateBookQuery, [title, author, price, pages, bookId]);

    if (dbResponse.changes === 0) {
      return res.status(404).json({ error: `Book with id ${bookId} not found` });
    }

    res.status(200).json({
      message: 'Book Details Updated Successfully',
      updatedBookId: Number(bookId)
    });
  } catch (error) {
    console.error(`Error in PUT /books/${req.params.bookId}:`, error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Route 5: DELETE /books/:bookId/
 * Removes a book from the database using a parameterized query (?).
 */
app.delete('/books/:bookId/', async (req, res) => {
  try {
    const database = await getDB();
    const { bookId } = req.params;
    const deleteBookQuery = `
      DELETE FROM
        book
      WHERE
        id = ?;
    `;

    const dbResponse = await database.run(deleteBookQuery, [bookId]);

    if (dbResponse.changes === 0) {
      return res.status(404).json({ error: `Book with id ${bookId} not found` });
    }

    res.status(200).json({
      message: 'Book Deleted Successfully',
      deletedBookId: Number(bookId)
    });
  } catch (error) {
    console.error(`Error in DELETE /books/${req.params.bookId}:`, error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 404 Handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    status: 404,
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}. Route not found.`
  });
});

module.exports = app;
