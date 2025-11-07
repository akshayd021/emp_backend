const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['Running', 'Completed', 'On Hold'], default: 'Running' },
    employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Employees currently assigned
    startDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);