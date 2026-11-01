import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 5000;

const client = new MongoClient(process.env.MONGODB_URI);

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
  })
);
app.use(express.json());

let eventsCollection;

// Connect MongoDB
async function connectToMongoDB() {
  await client.connect();

  const db = client.db();
  eventsCollection = db.collection("events");

  console.log("You successfully connected to MongoDB!");
}

// JWT Verification Middleware
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized access. Token required.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
}

// Server check
app.get("/", (req, res) => {
  res.json({
    message: "CareConnect server is running!",
  });
});

// Get upcoming events
app.get("/api/events", async (req, res) => {
  try {
    const now = new Date();

    // Home page: latest 6 created events that are still upcoming
    if (req.query.view === "recent") {
      const events = await eventsCollection
        .find({
          eventDate: { $gt: now },
        })
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .limit(6)
        .toArray();

      return res.json({
        success: true,
        count: events.length,
        events,
      });
    }

    // Upcoming Events page: all future events
    const events = await eventsCollection
      .find({
        eventDate: { $gt: now },
      })
      .sort({
        eventDate: 1,
      })
      .toArray();

    return res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Error fetching events:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch events.",
    });
  }
});

// Create event (JWT protected)
app.post("/api/events", verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      imageUrl,
      location,
      eventDate,
    } = req.body;

    if (
      !title?.trim() ||
      !description?.trim() ||
      !type?.trim() ||
      !location?.trim() ||
      !eventDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required event details.",
      });
    }

    const parsedDate = new Date(eventDate);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate <= new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "Event date must be in the future.",
      });
    }

    const creatorEmail = req.user.email?.trim().toLowerCase();

    if (!creatorEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found in token.",
      });
    }

    const event = {
      title: title.trim(),
      description: description.trim(),
      type: type.trim(),
      imageUrl: typeof imageUrl === "string" ? imageUrl.trim() : "",
      location: location.trim(),
      eventDate: parsedDate,
      creatorEmail,
      createdAt: new Date(),
    };

    const result = await eventsCollection.insertOne(event);

    res.status(201).json({
      success: true,
      message: "Event created successfully.",
      event: {
        ...event,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error("Error creating event:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create event.",
    });
  }
});

// Get my own events (JWT protected)
app.get("/api/my-events", verifyToken, async (req, res) => {
  try {
    const creatorEmail = req.user.email?.trim().toLowerCase();

    const events = await eventsCollection
      .find({
        creatorEmail,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Error fetching my events:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch your events.",
    });
  }
});

// Get one event by ID
app.get("/api/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    res.json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("Error fetching event:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch event.",
    });
  }
});

// Update my own event (JWT protected)
app.put("/api/events/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    const creatorEmail = req.user.email?.trim().toLowerCase();

    const {
      title,
      description,
      type,
      imageUrl,
      location,
      eventDate,
    } = req.body;

    if (
      !title?.trim() ||
      !description?.trim() ||
      !type?.trim() ||
      !location?.trim() ||
      !eventDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required event details.",
      });
    }

    const parsedDate = new Date(eventDate);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate <= new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "Event date must be in the future.",
      });
    }

    const result = await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
        creatorEmail,
      },
      {
        $set: {
          title: title.trim(),
          description: description.trim(),
          type: type.trim(),
          imageUrl: typeof imageUrl === "string" ? imageUrl.trim() : "",
          location: location.trim(),
          eventDate: parsedDate,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not authorized.",
      });
    }

    res.json({
      success: true,
      message: "Event updated successfully.",
    });
  } catch (error) {
    console.error("Error updating event:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update event.",
    });
  }
});

// Join an event (JWT protected)
app.post("/api/events/:id/join", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.user.email?.trim().toLowerCase();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "User email not found.",
      });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    if (new Date(event.eventDate) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "You cannot join a past event.",
      });
    }

    if (event.creatorEmail?.trim().toLowerCase() === email) {
      return res.status(400).json({
        success: false,
        message: "You cannot join your own event.",
      });
    }

    const alreadyJoined = (event.joinedUsers || []).includes(email);

    if (alreadyJoined) {
      return res.json({
        success: true,
        message: "You have already joined this event.",
      });
    }

    await eventsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $addToSet: { joinedUsers: email } }
    );

    res.json({
      success: true,
      message: "You joined the event successfully.",
    });
  } catch (error) {
    console.error("Error joining event:", error);

    res.status(500).json({
      success: false,
      message: "Failed to join event.",
    });
  }
});

// Get joined events of the logged-in user (JWT protected)
app.get("/api/joined-events", verifyToken, async (req, res) => {
  try {
    const email = req.user.email?.trim().toLowerCase();

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "User email not found.",
      });
    }

    const events = await eventsCollection
      .find({ joinedUsers: email })
      .sort({ eventDate: 1 })
      .toArray();

    res.json({
      success: true,
      events,
    });
  } catch (error) {
    console.error("Error fetching joined events:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch joined events.",
    });
  }
});

// Delete my own event (JWT protected)
app.delete("/api/events/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const creatorEmail = req.user.email?.trim().toLowerCase();

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID.",
      });
    }

    if (!creatorEmail) {
      return res.status(401).json({
        success: false,
        message: "User email not found.",
      });
    }

    const result = await eventsCollection.deleteOne({
      _id: new ObjectId(id),
      creatorEmail,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you are not authorized.",
      });
    }

    res.json({
      success: true,
      message: "Event deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting event:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete event.",
    });
  }
});

// Start server after connecting to MongoDB
async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from .env");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from .env");
    }

    await connectToMongoDB();

    app.listen(PORT, () => {
      console.log(`CareConnect server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();