import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

export const dynamic = 'force-dynamic';

function getDB() {
        if (admin.apps.length > 0) {
                return admin;
        }

        const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

        if (!serviceAccountBase64) {
                throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is missing!");
        }

        try {
                // 1. Decode the Base64 string
                const decodedBuffer = Buffer.from(serviceAccountBase64, 'base64');
                const decodedString = decodedBuffer.toString('utf-8');

                // DEBUG: Check if it looks like JSON before parsing
                // (We log only the first 20 chars to be safe)
                console.log("DEBUG: Decoded Start ->", decodedString.substring(0, 20) + "...");

                // 2. Parse JSON
                const serviceAccountJson = JSON.parse(decodedString);

                admin.initializeApp({
                        credential: admin.credential.cert(serviceAccountJson),
                });

                console.log("Firebase initialized successfully");
        } catch (error: any) {
                console.error("Firebase Init Failed:", error);

                // Throw a visible error for the API response
                throw new Error(`Failed to parse Service Account. Reason: ${error.message}`);
        }

        return admin;
}


// 2. Helper to verify ID Token
async function verifyAuth(request: Request) {
        const app = getDB();

        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

        const token = authHeader.split('Bearer ')[1];

        try {
                const decodedToken = await app.auth().verifyIdToken(token);
                return decodedToken.uid;
        } catch (error) {
                console.error("Auth Failed:", error);
                return null;
        }
}

// === GET: Fetch Transactions ===
export async function GET(request: Request) {
        try {
                const uid = await verifyAuth(request);
                if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

                const db = getDB().firestore();
                const snapshot = await db.collection(`users/${uid}/transactions`).get();

                const transactions = snapshot.docs.map(doc => {
                        const data = doc.data();
                        return {
                                id: doc.id,
                                ...data,
                                date: data.date && data.date.toDate ? data.date.toDate().toISOString() : data.date
                        };
                });

                return NextResponse.json(transactions);
        } catch (error: any) {
                return NextResponse.json({ error: error.message }, { status: 500 });
        }
}

export async function POST(request: Request) {
        try {
                const uid = await verifyAuth(request);
                if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

                const db = getDB().firestore();
                const data = await request.json();
                const { id, ...txData } = data;

                if (txData.date) txData.date = new Date(txData.date);

                const collectionRef = db.collection(`users/${uid}/transactions`);

                if (id) {
                        await collectionRef.doc(id).set(txData, { merge: true });
                        return NextResponse.json({ message: 'Updated', id });
                } else {
                        const docRef = await collectionRef.add(txData);
                        return NextResponse.json({ message: 'Created', id: docRef.id });
                }
        } catch (error: any) {
                return NextResponse.json({ error: error.message }, { status: 500 });
        }
}

export async function DELETE(request: Request) {
        try {
                const uid = await verifyAuth(request);
                if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

                const db = getDB().firestore();
                const { searchParams } = new URL(request.url);
                const id = searchParams.get('id');

                if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

                await db.collection(`users/${uid}/transactions`).doc(id).delete();
                return NextResponse.json({ message: 'Deleted' });
        } catch (error: any) {
                return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }