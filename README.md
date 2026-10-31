# BookNook Server - Online Library API

Backend server built with Node.js, Express.js, MongoDB, and JWT authentication for the BookNook application.

## Core Features
- 8 RESTful API endpoints for managing books and borrow records.
- Automatic copy tracking using MongoDB $inc operator on borrow and return.
- Duplicate borrow prevention for the same user and book.
- JWT token verification middleware for protected routes.
- Sorted and limited query support for dynamic New Arrivals.