import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
app.use(cors());
app.use(express.json());

const port = 8000;

const mongobdurl = process.env.MONGODB_URL;

const client = new MongoClient(mongobdurl);
export async function connectToMongoDB() {
  try {
    await client.connect();

    console.log("You successfully connected to MongoDB!");

    return client;
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    throw err;
  }
}

const mongodbClient = await connectToMongoDB();
const db = mongodbClient.db("wanderlust");
const destinationdb = db.collection("destination");
const bookingCollection = db.collection("booking");

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ mag: "Unauthorized!" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ mag: "Unauthorized!" });
  }

  const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}api/auth/jwks`),
  );
  try {
    const { payload } = await jwtVerify(token, JWKS);

    next();
  } catch (error) {
    return res.status(401).send({ mag: "Server Error!" });
  }
};

app.get("/", (req, res) => {
  res.send("the server is runing");
});

app.post("/add-destination", verifyToken, async (req, res) => {
  const data = req.body;
  // console.log("api called", data);
  const result = await destinationdb.insertOne(data);

  res.send(result);
});
app.post("/booking", async (req, res) => {
  try {
    const { _id, email, destinationId, ...bookingData } = req.body;

    if (!email || !destinationId) {
      return res.status(400).json({
        success: false,
        message: "Email and destination ID are required.",
      });
    }

    // Check whether this user has already booked this destination
    const existingBooking = await bookingCollection.findOne({
      email: email.toLowerCase().trim(),
      destinationId: destinationId,
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: "You have already booked this destination.",
      });
    }

    const result = await bookingCollection.insertOne({
      ...bookingData,
      email: email.toLowerCase().trim(),
      destinationId,
      bookingDate: new Date().toISOString(),
    });

    return res.status(201).json({
      success: true,
      message: "Booking successful!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create booking.",
    });
  }
});

app.get("/booking", async (req, res) => {
  try {
    const data = await bookingCollection.find().toArray();
    return res.status(200).json(data);
  } catch (error) {
    console.error("Get bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bookings.",
    });
  }
});
app.get("/booking/check", async (req, res) => {
  try {
    const { email, destinationId } = req.query;

    if (!email || !destinationId) {
      return res.status(400).json({
        success: false,
        message: "Email and destination ID are required.",
      });
    }

    const existingBooking = await bookingCollection.findOne({
      email: String(email).toLowerCase().trim(),
      destinationId: String(destinationId),
    });

    return res.json({
      success: true,
      isBooked: Boolean(existingBooking),
    });
  } catch (error) {
    console.error("Booking check error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check booking.",
    });
  }
});
app.delete("/booking/:id", async (req, res) => {
  const { id } = req.params;
  const result = await bookingCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});
app.get("/destinations", async (req, res) => {
  const data = await destinationdb.find().toArray();

  res.send(data);
});
// singel data
app.get("/destination/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const result = await destinationdb.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

// UPDATE
app.patch("/destination/:id", async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const result = await destinationdb.updateOne(
    { _id: new ObjectId(id) },
    { $set: data },
  );
  res.json(result);
});

app.delete("/destination/:id", async (req, res) => {
  const { id } = req.params;
  const result = await destinationdb.deleteOne({ _id: new ObjectId(id) });
  res.json(result);
});
// http//localhost:8000
app.listen(port, () => {
  console.log(`server app listening on port ${port}`);
});

export default app;
