import 'dotenv/config';
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is missing in your .env file');
}

export const client = new MongoClient(process.env.MONGODB_URI);

// Connect once, up front. If the URI/password/network is wrong, the server
// fails immediately with a clear error instead of failing later on requests.
await client.connect();
console.log('Connected successfully to MongoDB!');

export const db = client.db('booknookDB');
