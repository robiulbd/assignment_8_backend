import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { ObjectId } from 'mongodb';

import { db } from './lib/db.js';
import { auth } from './lib/auth.js';

const app = express();
const port = process.env.PORT || 5000;

// ১. CORS কনফিগারেশন
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
    ],
  })
);

// ২. Better Auth হ্যান্ডলার
app.all(
  /^\/api\/auth(\/.*)?$/,
  toNodeHandler(auth)
);

// ৩. JSON পার্সার
app.use(express.json());

// ৪. MongoDB কালেকশনসমূহ
const booksCollection = db.collection('books');
const borrowsCollection = db.collection('borrows');

// ৫. Async এরর হ্যান্ডলার ও ভ্যালিডেটর
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

// 1. GET /books - সব বই অথবা নির্দিষ্ট ইউজারের অ্যাড করা বই (email কুয়েরি থাকলে)
app.get(
  '/books',
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 0;
    const { email } = req.query;

    const filter = {};
    if (email && typeof email === 'string' && email.trim()) {
      filter.userEmail = {
        $regex: `^${email.trim()}$`,
        $options: 'i',
      };
    }

    const query = booksCollection.find(filter).sort({ _id: -1 });
    if (limit > 0) query.limit(limit);
    res.send(await query.toArray());
  })
);

// ২. নির্দিষ্ট একটি বইয়ের বিস্তারিত তথ্য
app.get(
  '/books/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const book = await booksCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!book) return res.status(404).send({ message: 'Book not found' });
    res.send(book);
  })
);

// 3. POST /books - নতুন বই অ্যাড করা
app.post(
  '/books',
  asyncHandler(async (req, res) => {
    const newBook = {
      ...req.body,
      copies: Number(req.body.copies) || 0,
      createdAt: new Date(),
    };
    res.send(await booksCollection.insertOne(newBook));
  })
);

// 4. PATCH /books/:id - বইয়ের তথ্য এডিট/আপডেট করা
app.patch(
  '/books/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const { _id, ...fields } = req.body;
    if (fields.copies !== undefined) {
      fields.copies = Number(fields.copies);
    }
    const result = await booksCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: fields }
    );
    res.send(result);
  })
);

// ৫. বই ডিলিট করা
app.delete(
  '/books/:id',
  validateId,
  asyncHandler(async (req, res) => {
    res.send(await booksCollection.deleteOne({ _id: new ObjectId(req.params.id) }));
  })
);

// ৬. বই বরো করা (যেকোনো লগইন করা ইউজারের জন্য)
app.post(
  '/borrows',
  asyncHandler(async (req, res) => {
    const {
      bookId,
      bookTitle,
      bookImage,
      userName,
      userEmail,
      borrowDate,
      returnDate,
    } = req.body;

    if (
      !bookId ||
      !ObjectId.isValid(bookId) ||
      typeof userEmail !== 'string' ||
      !userEmail.trim()
    ) {
      return res.status(400).json({
        message: 'Valid bookId and userEmail are required.',
      });
    }

    const normalizedEmail = userEmail.trim().toLowerCase();
    const cleanUserName = typeof userName === 'string' && userName.trim()
      ? userName.trim()
      : 'Library Reader';

    // একই ইউজার একই বই আগে বরো করেছে কি না তা চেক করা
    const existingBorrow = await borrowsCollection.findOne({
      bookId,
      userEmail: normalizedEmail,
    });

    if (existingBorrow) {
      return res.status(409).json({
        message: 'You have already borrowed this book.',
      });
    }

    // বইয়ের কপি ১ কমানো
    const updated = await booksCollection.updateOne(
      {
        _id: new ObjectId(bookId),
        copies: { $gt: 0 },
      },
      {
        $inc: { copies: -1 },
      }
    );

    if (updated.matchedCount === 0) {
      return res.status(400).json({
        message: 'Book not found or no copies available.',
      });
    }

    const borrowData = {
      bookId,
      bookTitle,
      bookImage: bookImage || '',
      userName: cleanUserName,
      userEmail: normalizedEmail,
      borrowDate: borrowDate || new Date().toISOString(),
      returnDate,
      createdAt: new Date(),
    };

    try {
      const result = await borrowsCollection.insertOne(borrowData);

      return res.status(201).json({
        message: 'Book borrowed successfully.',
        borrow: {
          _id: result.insertedId,
          ...borrowData,
        },
      });
    } catch (error) {
      await booksCollection.updateOne(
        { _id: new ObjectId(bookId) },
        { $inc: { copies: 1 } }
      );
      throw error;
    }
  })
);

// ৭. লগইন করা ইউজারের বরো করা বইয়ের লিস্ট ফেচ করা
app.get(
  '/borrows',
  asyncHandler(async (req, res) => {
    const { email } = req.query;
    if (!email || typeof email !== 'string') {
      return res.status(400).send({ message: 'email is required' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const list = await borrowsCollection
      .find({ userEmail: normalizedEmail })
      .sort({ _id: -1 })
      .toArray();
    res.send(list);
  })
);

// ৮. বই রিটার্ন করা
app.delete(
  '/borrows/:id',
  validateId,
  asyncHandler(async (req, res) => {
    const id = new ObjectId(req.params.id);
    const borrowDoc = await borrowsCollection.findOne({ _id: id });

    if (borrowDoc && ObjectId.isValid(borrowDoc.bookId)) {
      await booksCollection.updateOne(
        { _id: new ObjectId(borrowDoc.bookId) },
        { $inc: { copies: 1 } }
      );
    }

    res.send(await borrowsCollection.deleteOne({ _id: id }));
  })
);

// --- এরর হ্যান্ডলার ---
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send({ message: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});