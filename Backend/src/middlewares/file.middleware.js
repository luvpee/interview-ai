const multer = require("multer")

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true)
    } else {
      cb(new Error("Only PDF files are supported for resume upload."), false)
    }
  }
})

module.exports = upload