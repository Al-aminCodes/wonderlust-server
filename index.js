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

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({
      message: "Unauthorized!",
    });
  }

  try {
    const token = authHeader.split(" ")[1];
    const { payload } = await jwtVerify(token, JWKS);

    req.user = {
      email: payload.email,
    };

    next();
  } catch (error) {
    return res.status(401).send({
      message: "Invalid or expired token!",
    });
  }
};

app.get("/", (req, res) => {
  res.send("the server is runing");
});

app.post("/add-destination", verifyToken, async (req, res) => {
  try {
    const data = {
      ...req.body,
      userEmail: req.user.email,
    };

    const result = await destinationdb.insertOne(data);

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to add destination" });
  }
});
app.post("/booking", verifyToken, async (req, res) => {
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

app.get("/booking", verifyToken, async (req, res) => {
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
// limied destination api
app.get("/destination/limit", async (req, res) => {
  const data = await destinationdb.find().limit(6).toArray();
  res.send(data);
});
// singel data
app.get("/destination/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid destination ID",
      });
    }

    const result = await destinationdb.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({
        message: "Destination not found",
      });
    }

    const { userEmail, ...destination } = result;

    res.send({
      ...destination,
      isOwner: userEmail === req.user.email,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: "Failed to fetch destination",
    });
  }
});
app.get("/my-destination/:email", async (req, res) => {
  const { email } = req.params;
  const result = await destinationdb.find({ userEmail: email }).toArray();
  res.send(result);
});

// UPDATE
app.patch("/destination/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid destination ID" });
    }

    const {
      name,
      country,
      category,
      price,
      duration,
      departureDate,
      imageUrl,
      description,
    } = req.body;

    const data = {
      ...(name !== undefined && { name }),
      ...(country !== undefined && { country }),
      ...(category !== undefined && { category }),
      ...(price !== undefined && { price }),
      ...(duration !== undefined && { duration }),
      ...(departureDate !== undefined && { departureDate }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(description !== undefined && { description }),
    };

    if (Object.keys(data).length === 0) {
      return res.status(400).send({ message: "No valid fields to update" });
    }

    const result = await destinationdb.updateOne(
      {
        _id: new ObjectId(id),
        userEmail: req.user.email,
      },
      { $set: data },
    );

    if (result.matchedCount === 0) {
      return res.status(403).send({
        message: "You cannot update this destination",
      });
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to update destination" });
  }
});

app.delete("/destination/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid destination ID" });
    }

    const result = await destinationdb.deleteOne({
      _id: new ObjectId(id),
      userEmail: req.user.email,
    });

    if (result.deletedCount === 0) {
      return res.status(403).send({
        message: "You cannot delete this destination",
      });
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to delete destination" });
  }
});
// http//localhost:8000
app.listen(port, () => {
  console.log(`server app listening on port ${port}`);
});

export default app;
