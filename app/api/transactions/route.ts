import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// 1. Initialize Firebase Admin (Server-Side)
if (!admin.apps.length) {
        admin.initializeApp({
                credential: admin.credential.cert({
                        projectId: process.env.FIREBASE_PROJECT_ID,
                        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                        // Handle newline characters in the private key
                        privateKey: process.env.FIREBASE_PRIVATE_KEY
                                ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                                : undefined,
                }),
        });
}

const db = admin.firestore();

// 2. Helper to verify ID Token
async function verifyAuth(request: Request) {
        const token = request.headers.get('Authorization');
        if (!token) return null;

        try {
                const decodedToken = await admin.auth().verifyIdToken(token);
                return decodedToken.uid;
        } catch (error) {
                return null;
        }
}

// === GET: Fetch Transactions ===
export async function GET(request: Request) {
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