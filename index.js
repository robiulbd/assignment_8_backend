import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { ObjectId } from 'mongodb';
import { db } from './lib/db.js';
import { auth } from './lib/auth.js';

const app = express();
const port = process.env.PORT || 5000;

// 1) CORS must come first
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 2) JSON body parsing MUST come before Better Auth handler so req.body is available!
app.use(express.json());

// 3) Better Auth handler
app.all(/^\/api\/auth(\/.*)?$/, toNodeHandler(auth));
// --- Helpers ---
const booksCollection = db.collection('books');
const borrowsCollection = db.collection('borrows');

// Forwards thrown errors from async routes to the error handler
// (prevents the server from crashing on Express 4).
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const validateId = (req, res, next) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send({ message: 'Invalid id' });
  }
  next();
};

// --- API ROUTES ---

app.get('/', (req, res) => {
  res.send('BookNook Server is running...');
});

// 1. GET /books - all books, or the latest N for the home page
app.get(
  '/books',
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 0;
    const query = booksCollection.find().sort({ _id: -1 });
    if (limit > 0) query.limit(limit);
    res.send(await query.toArray());
  })
);

// 2. GET /books/:id - single book
app.get(
  '/books/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const book = await booksCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!book) return res.status(404).send({ message: 'Book not found' });
    res.send(book);
  })
);

// 3. POST /books - add a book
app.post(
  '/books',
  asyncHandler(async (req, res) => {
    const newBook = { ...req.body, createdAt: new Date() };
    res.send(await booksCollection.insertOne(newBook));
  })
);

// 4. PATCH /books/:id - update a book
app.patch(
  '/books/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { _id, ...fields } = req.body; // never try to overwrite _id
    const result = await booksCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: fields }
    );
    res.send(result);
  })
);

// 5. DELETE /books/:id - delete a book
app.delete(
  '/books/:id',
  validateId,
  asyncHandler(async (req, res) => {
    res.send(await booksCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
  })
);

// 6. POST /borrows - borrow a book (duplicate check + copies check)
app.post(
  '/borrows',
  asyncHandler(async (req, res) => {
    const borrowData = req.body;

    if (!ObjectId.isValid(borrowData.bookId) || !borrowData.userEmail) {
      return res.status(400).send({ message: 'bookId and userEmail are required' });
    }

    const existingBorrow = await borrowsCollection.findOne({
      bookId: borrowData.bookId,
      userEmail: borrowData.userEmail,
    });
    if (existingBorrow) {
      return res.status(400).send({ message: 'You have already borrowed this book!' });
    }

    // Only decrement when at least one copy is available
    const updated = await booksCollection.updateOne(
      { _id: new ObjectId(borrowData.bookId), copies: { $gt: 0 } },
      { $inc: { copies: -1 } }
    );
    if (updated.matchedCount === 0) {
      return res.status(400).send({ message: 'No copies available for this book' });
    }

    res.send(await borrowsCollection.insertOne(borrowData));
  })
);

// 7. GET /borrows?email=... - a user's borrowed books
app.get(
  '/borrows',
  asyncHandler(async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).send({ message: 'email is required' });
    res.send(await borrowsCollection.find({ userEmail: email }).toArray());
  })
);

// 8. DELETE /borrows/:id - return a book
app.delete(
  '/borrows/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const id = new ObjectId(req.params.id);
    const borrowDoc = await borrowsCollection.findOne({ _id: id });

    if (borrowDoc) {
      await booksCollection.updateOne(
        { _id: new ObjectId(borrowDoc.bookId) },
        { $inc: { copies: 1 } }
      );
    }

    res.send(await borrowsCollection.deleteOne({ _id: id }));
  })
);

// --- Error handler (must be last) ---
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send({ message: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});