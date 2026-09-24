const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

/* require all the routes here */
const authRouter = require("./routes/auth.routes")
const interviewRouter = require("./routes/interview.route")

/*using all the routes here */
app.use("/api/auth", authRouter)
app.use("/api/interview", interviewRouter)

/* Global error handler */
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  const status = err.status || err.statusCode || (err.name === "MulterError" ? 400 : 500);
  res.status(status).json({
    message: err.message || "An unexpected error occurred."
  });
});

module.exports = app;