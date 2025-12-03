import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

export const dynamic = 'force-dynamic';

// 1. Initialize Firebase Admin (Server-Side)
if (!admin.apps.length) {
        if (process.env.FIREBASE_PRIVATE_KEY) {
                try {
                        admin.initializeApp({
                                credential: admin.credential.cert({
                                        projectId: process.env.FIREBASE_PROJECT_ID,
                                        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                                        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                                }),
                        });
                        console.log("Firebase initialized successfully");
                } catch (error) {
                        console.error("Firebase init failed:", error);
                }
        } else {
                // This log prevents the build from crashing if keys are missing
                console.warn("Firebase Private Key not found. Skipping init during build.");
        }
    }

const db = admin.firestore();

// 2. Helper to verify ID Token
async function verifyAuth(request: Request) {
        const authHeader = request.headers.get('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
                console.log(authHeader);
                return null;
        }

        const token = authHeader.split('Bearer ')[1];

        console.log("2. Token found:", token.substring(0, 10) + "...");

        try {
                const decodedToken = await admin.auth().verifyIdToken(token);
                console.log("User Found:", decodedToken.uid)
                return decodedToken.uid;
        } catch (error) {

                console.error("VERIFICATION FAILED:", error);

                if (error === 'auth/argument-error') {
                        console.log("Hint: Token format looks wrong (Is it empty string?)");
                }
                if (error === 'auth/id-token-expired') {
                        console.log("Hint: Token is old. Logout and Login again.");
                   }
                return null;
        }
}

// === GET: Fetch Transactions ===
export async function GET(request: Request) {
        console.log("------------------------------------------------");
        console.log("Checking Env Vars:");
        console.log("Project ID:", process.env.FIREBASE_PROJECT_ID); // Safe to log
        console.log("Client Email:", process.env.FIREBASE_CLIENT_EMAIL); // Safe to log

        // NEVER log the full Private Key. Just check if it exists.
        const hasKey = !!process.env.FIREBASE_PRIVATE_KEY;
        console.log("Has Private Key?", hasKey ? "YES" : "NO");
        console.log("------------------------------------------------");

        const uid = await verifyAuth(request);

        if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        try {
                const snapshot = await db.collection(`users/${uid}/transactions`).get();
                const transactions = snapshot.docs.map(doc => {
                        const data = doc.data();
                        return {
                                id: doc.id,
                                ...data,
                                // Convert Firestore Timestamp to String
                                date: data.date && data.date.toDate ? data.date.toDate().toISOString() : data.date
                        };
                });

                return NextResponse.json(transactions);
        } catch (error: any) {
                return NextResponse.json({ error: error.message }, { status: 500 });
        }
}

// === POST: Add Transaction ===
export async function POST(request: Request) {
        const uid = await verifyAuth(request);
        if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        try {
                const data = await request.json();
                const { id, ...txData } = data; // Separate ID if editing

                // Ensure date is a proper Date object for Firestore
                if (txData.date) {
                        txData.date = new Date(txData.date);
                }

                const collectionRef = db.collection(`users/${uid}/transactions`);

                if (id) {
                        // Edit existing
                        await collectionRef.doc(id).set(txData, { merge: true });
                        return NextResponse.json({ message: 'Updated', id });
                } else {
                        // Create new
                        const docRef = await collectionRef.add(txData);
                        return NextResponse.json({ message: 'Created', id: docRef.id });
                }
        } catch (error: any) {
                return NextResponse.json({ error: error.message }, { status: 500 });
        }
}

// === DELETE: Remove Transaction ===
export async function DELETE(request: Request) {
        const uid = await verifyAuth(request);
        if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Get ID from URL query parameters (e.g., ?id=123)
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

        try {
                await db.collection(`users/${uid}/transactions`).doc(id).delete();
                return NextResponse.json({ message: 'Deleted' });
        } catch (error: any) {
                return NextResponse.json({ error: error.message }, { status: 500 });
        }
}