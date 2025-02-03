import express, { Request, Response } from "express";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { z } from "zod";
import archiver from "archiver";
import cors from 'cors';


const PORT = 3000;

// Define contact interface and validation using Zod
interface Contact {
    id: string;
    name: string;
    phone: string;
    email: string;
    bookmarked: boolean;
}

const contactSchema = z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().min(1, "Phone number is required"),
    email: z.string().email("Invalid email format"),
    bookmarked: z.boolean().optional(),
});

// Initialize Express app
const app = express();
app.use(express.json());
app.use(cors());

// Define contacts file path
const contactsFilePath = path.join(__dirname, "contacts.json");

// Ensure the contacts file exists
if (!fs.existsSync(contactsFilePath)) {
    fs.writeFileSync(contactsFilePath, JSON.stringify([])); // Create an empty file if not present
}

// Helper function to read contacts from the file
const readContactsFromFile = (): Contact[] => {
    const fileData = fs.readFileSync(contactsFilePath, "utf-8");
    return JSON.parse(fileData);
};

// Helper function to write contacts to the file
const writeContactsToFile = (contacts: Contact[]): void => {
    fs.writeFileSync(contactsFilePath, JSON.stringify(contacts, null, 2));
};

// **API Endpoints**

app.get("/contacts", (req: Request, res: Response) => {
    const contacts = readContactsFromFile();
    res.json(contacts);
});
app.get("/contacts/:id", (req: Request, res: Response) => {
    const contactId = req.params.id;
    const contacts = readContactsFromFile();
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
    }
    res.status(200).json(contact);
})

app.post("/contacts", (req: Request, res: Response) => {
    try {
        // Validate the input
        const contact = contactSchema.parse(req.body);

        // Generate a new ID for the contact
        const newContact: Contact = {
            id: uuidv4(), // Assign a new ID explicitly
            ...contact, // Spread the rest of the validated fields
            bookmarked: contact.bookmarked ?? false, // Ensure `bookmarked` has a default value if undefined
        };

        const contacts = readContactsFromFile();
        contacts.push(newContact);

        writeContactsToFile(contacts);

        res.status(201).json(newContact);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.errors });
        } else {
            res.status(500).json({ message: "Server error" });
        }
    }
});

app.patch("/contacts/:id", (req: Request, res: Response) => {
    try {
        const contactId = req.params.id;
        const contact = contactSchema.parse(req.body);

        const contacts = readContactsFromFile();
        const index = contacts.findIndex((c) => c.id === contactId);

        if (index === -1) {
            return res.status(404).json({ message: "Contact not found" });
        }

        contacts[index] = { ...contacts[index], ...contact };

        writeContactsToFile(contacts);

        res.json(contacts[index]);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ errors: error.errors });
        } else {
            res.status(500).json({ message: "Server error" });
        }
    }
});

app.delete("/contacts/:id", (req: Request, res: Response) => {
    const contactId = req.params.id;
    const contacts = readContactsFromFile();

    const updatedContacts = contacts.filter((contact) => contact.id !== contactId);

    if (updatedContacts.length === contacts.length) {
        return res.status(404).json({ message: "Contact not found" });
    }

    writeContactsToFile(updatedContacts);

    res.status(204).send();
});

app.get("/contacts/export", async (req: Request, res: Response) => {
    try {
        const contacts = readContactsFromFile();
        const vcfDir = path.join(__dirname, "exports");

        // Ensure the export directory exists
        if (!fs.existsSync(vcfDir)) {
            fs.mkdirSync(vcfDir);
        }

        // Set response headers
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename=contacts.zip');

        // Create zip archive
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        // Pipe archive data to the response
        archive.pipe(res);

        // Error handling
        archive.on('error', (err) => {
            throw err;
        });

        // Process each contact
        for (const contact of contacts) {
            const vcfContent = `BEGIN:VCARD
                VERSION:3.0
                FN:${contact.name}
                TEL:${contact.phone}
                EMAIL:${contact.email}
                END:VCARD
            `;
            // Add vcf content directly to the archive without writing to disk
            archive.append(vcfContent, { name: `${contact.id}.vcf` });
        }

        // Finalize the archive
        await archive.finalize();

    } catch (error) {
        console.error('Export error:', error);
        // Only send error if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error exporting contacts' });
        }
    } finally {
        // Clean up export directory if it exists
        if (fs.existsSync(path.join(__dirname, "exports"))) {
            fs.rmSync(path.join(__dirname, "exports"), { recursive: true, force: true });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});