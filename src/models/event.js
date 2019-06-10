import mongoose from 'mongoose';
import { pointSchema, polygonSchema } from '../schemas/geojson';

const EventSchema = new mongoose.Schema({
  id: Number,
  name: String,
  start: Date,
  end: Date,
  location: pointSchema,
  polygon: polygonSchema,
});

export default mongoose.model('Event', EventSchema);
