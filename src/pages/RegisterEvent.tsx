import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Client, Realtime } from 'appwrite';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CircleNotch,
    CheckCircle,
    WarningCircle,
    DownloadSimple,
    ShieldCheck,
    Lightning,
    QrCode,
    ArrowRight,
    CreditCard,
    ShareNetwork,
    Timer,
    XCircle
} from '@phosphor-icons/react';

const API_URL = 'https://payment-api.nerdpixel.workers.dev/api';

const APPWRITE_ENDPOINT = 'https://backend.ieeesahrdaya.com/v1';
const APPWRITE_PROJECT_ID = '6948e3640018a902b864'; // TODO: replace
const APPWRITE_DB_ID = '697522750025b8e28c32';           // TODO: replace
const APPWRITE_COLLECTION_ID = 'payment'; // <- put the actual collection ID here (not just name)
const TICKET_WINDOW_MS = 5 * 60 * 1000;

// shared Appwrite client instance
const appwriteClient = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);
// realtime helper
const realtime = new Realtime(appwriteClient);

// Work around Appwrite server not including `subscriptions` in event frames.
// The official SDK drops any event lacking that property, so we patch the
// internal handler to dispatch by channel instead when subscriptions are
// empty.  This ensures our callback fires for document updates.
(function patchRealtime() {
    const r: any = realtime;
    if (r && typeof r.handleResponseEvent === 'function') {
        const original = r.handleResponseEvent.bind(r);
        r.handleResponseEvent = function (message: any) {
            const data = message.data || {};
            // if backend sent a subscriptions array we still want the normal
            // behavior so call the original first; it will early-return if it
            // doesn't match, which is fine since we then run our fallback.
            try {
                original(message);
            } catch (e) {
                console.warn('patched handleResponseEvent original threw', e);
            }

            // fallback: deliver to any active subscription whose channel
            // matches one of the event's channels, regardless of subscription
            // IDs.  This handles the case where `data.subscriptions` is missing
            // or empty.
            const channels: string[] = data.channels || [];
            const events: string[] = data.events || [];
            const payload = data.payload;
            const timestamp = data.timestamp;

            if (channels.length > 0 && payload !== undefined) {
                for (const [slot, sub] of this.activeSubscriptions || []) {
                    for (const ch of channels) {
                        if (sub.channels && sub.channels.has(ch)) {
                            sub.callback({ events, channels, timestamp, payload, subscriptions: [] });
                            break;
                        }
                    }
                }
            }
        };
    }
})();




interface TicketResponse {
    id: string;            // internal document id
    ticketId: string;      // human-readable code
    amount: number;
    upi_string?: string;   // optional, backend might no longer provide
    status: string;
    createdAt: string;
}

interface StatusResponse {
    id: string;            // internal id
    ticketId: string;
    status: string;
    amount: number;
    upi_string?: string;
    senderName?: string;
    rrn?: string;
    paidAt?: string;
    createdAt: string;
}


const RegisterEvent = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const ticketId = searchParams.get('ticketId');
    const internalId = searchParams.get('id');

    const [amount, setAmount] = useState('');

    const [status, setStatus] = useState<'idle' | 'loading' | 'pending' | 'paid' | 'expired'>(
        ticketId ? 'pending' : 'idle'
    );

    const [error, setError] = useState('');
    const [upiString, setUpiString] = useState('');
    const [createdAt, setCreatedAt] = useState('');
    const [timeLeft, setTimeLeft] = useState(0);
    const [showAmountForm, setShowAmountForm] = useState(false);
    const [docId, setDocId] = useState(''); // internal secure id from backend


    // when component mounts with a ticketId in the URL, fetch its status to resume
    useEffect(() => {
        if (!ticketId) return;
        axios.get<StatusResponse>(`${API_URL}/status/${ticketId}`)
            .then(res => {
                setDocId(res.data.id);
                if (!internalId) {
                    // keep internalId in sync if needed
                    setSearchParams(prev => {
                        const np = new URLSearchParams(prev);
                        np.set('id', res.data.id);
                        return np;
                    });
                }
                if (res.data.status === 'paid' || res.data.paidAt) {
                    setStatus('paid');
                    setCreatedAt(res.data.createdAt);
                    setAmount(String(res.data.amount));
                    setUpiString(`upi://pay?pa=souravpbijoy-3@okaxis&am=${res.data.amount}&tn=${res.data.ticketId}&cu=INR&pn=IEEESahrdaya`);
                    setTimeout(() => navigate(`/ticket/${res.data.ticketId}`), 1500);
                    return;
                }

                if (res.data.status === 'cancelled') {
                    setStatus('expired');
                    return;
                }

                // pending and still within window
                setCreatedAt(res.data.createdAt);
                setAmount(String(res.data.amount));
                setUpiString(`upi://pay?pa=souravpbijoy-3@okaxis&am=${res.data.amount}&tn=${res.data.ticketId}&cu=INR&pn=IEEESahrdaya`);
                setStatus('pending');
            })
            .catch(err => {
                console.error('Status fetch failed', err);
                setStatus('idle');
            });
    }, [ticketId]);

    const createTicket = async () => {
        // we will receive both internal id and ticketId
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            setError('Please enter a valid amount');
            return;
        }

        try {
            setStatus('loading');
            setError('');
            const res = await axios.post<TicketResponse>(`${API_URL}/ticket`, {
                amount: Number(amount)
            });
            console.log('Ticket Created:', res.data);

            // build our own UPI string from the amount and human ticketId
            setCreatedAt(res.data.createdAt);
            setAmount(String(res.data.amount));
            setDocId(res.data.id);
            setUpiString(`upi://pay?pa=souravpbijoy-3@okaxis&am=${res.data.amount}&tn=${res.data.ticketId}&cu=INR&pn=IEEESahrdaya`);


            setSearchParams(prev => {
                const newParams = new URLSearchParams(prev);
                newParams.set('ticketId', res.data.ticketId);
                newParams.set('id', res.data.id);
                return newParams;
            });

            setStatus('pending');
        } catch (err) {
            console.error(err);
            setError('System error. Please try generating the code again.');
            setStatus('idle');
        }
    };

    useEffect(() => {
        if (!ticketId || status !== 'pending' || !createdAt) return;

        // Use the API's official creation time to compute the remaining window
        const timePassedMs = Date.now() - new Date(createdAt).getTime();
        const remaining = TICKET_WINDOW_MS - timePassedMs;

        if (remaining <= 0) {
            setStatus('expired');
            return;
        }

        setTimeLeft(Math.floor(remaining / 1000));

        // Countdown tick
        const countdown = setInterval(() => {
            setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1));
        }, 1000);

        // Hard expire at the exact remaining time
        const expireTimer = setTimeout(() => {
            setStatus('expired');
        }, remaining);

        return () => {
            clearInterval(countdown);
            clearTimeout(expireTimer);
        };
    }, [ticketId, status, createdAt]);

    // separate effect solely responsible for realtime updates (no polling)
    useEffect(() => {
        if (!docId) return;
        const path = `databases.${APPWRITE_DB_ID}.collections.${APPWRITE_COLLECTION_ID}.documents.${docId}`;

        // keep a reference to the unsubscribe function so cleanup works even
        // if the subscribe promise resolves after unmount
        let unsubscribeFn: (() => void) | null = null;

        // helper to create the subscription and stash the unbinder
        const setup = async () => {
            try {
                const sub: any = await realtime.subscribe(
                    path,
                    async (response: { payload: any; error?: any }) => {
                        if (response.error) {
                            console.error('appwrite subscription error', response.error);
                        }
                        const doc = response.payload?.document || response.payload;
                        if (!doc) return;
                        if (doc.status === 'paid' || doc.paidAt) {
                            // re‑confirm using the public ticketId endpoint as requested
                            try {
                                const res = await axios.get<StatusResponse>(
                                    `${API_URL}/status/${doc.ticketId}`
                                );
                                setCreatedAt(res.data.createdAt);
                                setAmount(String(res.data.amount));
                                setUpiString(
                                    `upi://pay?pa=souravpbijoy-3@okaxis&am=${res.data.amount}&tn=${res.data.ticketId}&cu=INR&pn=IEEESahrdaya`
                                );
                            } catch (err) {
                                console.error(
                                    'error refetching status after paid event',
                                    err
                                );
                            }
                            setStatus('paid');
                            setTimeout(() => navigate(`/ticket/${doc.ticketId}`), 1500);
                            // immediately unsubscribe so we don't get duplicate
                            unsubscribeFn && unsubscribeFn();
                        }
                    }
                );

                if (sub && typeof sub.unsubscribe === 'function') {
                    unsubscribeFn = () => sub.unsubscribe();
                }
            } catch (err) {
                console.error('subscribe promise rejected', err);
            }
        };

        setup();

        return () => {
            console.log('unsubscribing from', docId, 'path', path);
            unsubscribeFn && unsubscribeFn();
        };
    }, [docId, navigate]);



    const upiUrl = upiString;
    const displayAmount = amount;

    const getQRBlob = (): Promise<Blob | null> => new Promise((resolve) => {
        const svg = document.querySelector('#qr-code-container svg');
        if (!svg) return resolve(null);
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        const padding = 24;
        img.onload = () => {
            canvas.width = img.width + padding * 2;
            canvas.height = img.height + padding * 2;
            if (ctx) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, padding, padding);
                canvas.toBlob(b => resolve(b), 'image/png');
            } else resolve(null);
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    });

    const downloadQR = async () => {
        const blob = await getQRBlob();
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = `upi-qr-${ticketId}.png`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
    };

    const shareQR = async () => {
        const blob = await getQRBlob();
        if (!blob) return;
        const file = new File([blob], `upi-qr-${ticketId}.png`, { type: 'image/png' });
        if (!navigator.share) {
            alert('Sharing is not supported on this browser. Use the Save QR button instead.');
            return;
        }
        try {
            await navigator.share({
                files: [file],
                title: 'UPI Payment QR',
                text: `Scan to pay ₹${displayAmount} — select GPay from the share sheet`
            });
        } catch (err: unknown) {
            if ((err as DOMException)?.name !== 'AbortError') {
                alert('Could not open share sheet.');
            }
        }
    };

    return (
        <div className="min-h-dvh bg-[#f9fafb] text-slate-900 font-sans p-6 md:p-12 flex flex-col justify-center overflow-x-hidden">
            <div className="max-w-300 mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">

                {/* Left Side: Asymmetrical Hero */}
                <div className="lg:col-span-7 flex flex-col justify-center pt-10 lg:pt-0">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-8"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/5 border border-slate-900/10">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                            <span className="text-xs font-semibold tracking-wide text-slate-700 uppercase">Under Construction</span>
                        </div>

                        <h1 className="text-5xl lg:text-7xl tracking-tighter leading-[0.9] font-bold text-slate-950">
                            IEEE Sahrdaya<br />
                            <span className="text-slate-400">Payment Portal.</span>
                        </h1>
                        <p className="text-lg text-slate-600 leading-relaxed max-w-[50ch] mt-6">
                            Secure your access instantly. Generate a unique cryptographic pass, scan via any UPI app, and receive your verified entry ticket.
                        </p>

                        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 mt-2">
                            <p className="text-sm text-amber-800 leading-relaxed">
                                This portal is currently under active development. Some features may be incomplete or subject to change.
                            </p>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.8 }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12"
                    >
                        <div className="bg-white p-8 rounded-4xl border border-slate-200/50 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)] hover:-translate-y-1 transition-transform duration-300">
                            <ShieldCheck weight="duotone" className="w-8 h-8 text-slate-900 mb-5" />
                            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Verified Protocol</h3>
                            <p className="text-sm text-slate-500 mt-2 leading-relaxed">End-to-end secure transactions directly linked to your digital identity.</p>
                        </div>
                        <div className="bg-white p-8 rounded-4xl border border-slate-200/50 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)] hover:-translate-y-1 transition-transform duration-300">
                            <Lightning weight="duotone" className="w-8 h-8 text-slate-900 mb-5" />
                            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Instant Issue</h3>
                            <p className="text-sm text-slate-500 mt-2 leading-relaxed">Zero latency ticket generation immediately post-payment verification.</p>
                        </div>
                    </motion.div>
                </div>

                {/* Right Side: Interactive Bento Container */}
                <div className="lg:col-span-5 relative w-full max-w-md mx-auto lg:mx-0">
                    {/* Background blob for depth */}
                    <div className="absolute inset-0 bg-slate-200/40 rounded-[3rem] blur-2xl -z-10 transform rotate-3 scale-105"></div>

                    <motion.div
                        layout
                        transition={{ type: "spring", stiffness: 100, damping: 20 }}
                        className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200/80 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.08)] relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <QrCode weight="fill" className="w-32 h-32" />
                        </div>

                        <AnimatePresence mode="wait">
                            {status === 'idle' && (
                                <motion.div
                                    key="idle"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="relative z-10"
                                >
                                    {!showAmountForm ? (
                                        <>
                                            <div className="mb-6">
                                                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Testing Site</h2>
                                                <p className="text-sm text-slate-500 mt-1">This portal is not yet in production.</p>
                                            </div>

                                            <div className="p-5 rounded-[1.25rem] bg-amber-50 border border-amber-200 mb-6">
                                                <p className="text-sm font-semibold text-amber-800 mb-1">Heads up</p>
                                                <p className="text-xs text-amber-700 leading-relaxed">
                                                    This is a testing site. Payments processed here are real UPI transactions.
                                                    Only proceed if you intend to make a test payment.
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => setShowAmountForm(true)}
                                                className="group relative w-full flex items-center justify-between bg-slate-950 text-white rounded-[1.25rem] py-4 px-6 font-semibold overflow-hidden transition-all active:scale-[0.98] hover:bg-slate-800"
                                            >
                                                <span className="relative z-10">I'm a Tester</span>
                                                <span className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors">
                                                    <ArrowRight className="w-4 h-4" />
                                                </span>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="mb-8">
                                                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Initialize Ticket</h2>
                                                <p className="text-sm text-slate-500 mt-1">Enter desired amount for the transaction.</p>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="relative group">
                                                    <label className="block text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                                                        Amount
                                                    </label>
                                                    <div className="relative flex items-center">
                                                        <span className="absolute left-4 text-slate-400 font-medium text-xl">₹</span>
                                                        <input
                                                            type="number"
                                                            value={amount}
                                                            onChange={(e) => setAmount(e.target.value)}
                                                            placeholder="0.00"
                                                            className="w-full bg-slate-50/50 border border-slate-200 rounded-[1.25rem] py-4 pl-10 pr-4 text-2xl font-bold text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                                                            autoFocus
                                                        />
                                                    </div>
                                                    {error && (
                                                        <motion.p
                                                            initial={{ opacity: 0, y: -10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            className="text-red-500 text-sm mt-3 flex items-center gap-1.5"
                                                        >
                                                            <WarningCircle weight="fill" />
                                                            {error}
                                                        </motion.p>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={createTicket}
                                                    disabled={!amount || Number(amount) <= 0}
                                                    className="group relative w-full flex items-center justify-between bg-slate-950 text-white rounded-[1.25rem] py-4 px-6 font-semibold overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                                                >
                                                    <span className="relative z-10">Generate Pass</span>
                                                    <span className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors">
                                                        <ArrowRight className="w-4 h-4" />
                                                    </span>
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </motion.div>
                            )}

                            {status === 'loading' && (
                                <motion.div
                                    key="loading"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center py-12 text-slate-900 relative z-10"
                                >
                                    <CircleNotch className="w-10 h-10 animate-spin text-slate-900 mb-6" weight="bold" />
                                    <h3 className="text-xl font-bold tracking-tight">Securing Session</h3>
                                    <p className="text-sm text-slate-500 mt-2 text-center">Negotiating transaction protocol with server...</p>
                                </motion.div>
                            )}

                            {status === 'pending' && ticketId && (
                                <motion.div
                                    key="pending"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="relative z-10 flex flex-col items-center"
                                >
                                    <div className="w-full flex justify-between items-center mb-6">
                                        <div className="flex items-center gap-2">
                                            <CreditCard className="text-slate-400 w-5 h-5" />
                                            <span className="text-sm font-semibold text-slate-900">₹{displayAmount}</span>
                                        </div>
                                        <div className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded-md">
                                            ID: {ticketId.slice(0, 8)}...
                                        </div>
                                    </div>

                                    <div
                                        id="qr-code-container"
                                        className="bg-white p-2 rounded-3xl shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_8px_16px_-4px_rgba(0,0,0,0.1)] mb-8"
                                    >
                                        <QRCodeSVG value={upiUrl} size={220} level="H" includeMargin={true} />
                                    </div>

                                    <div className="w-full space-y-3">
                                        <button
                                            onClick={shareQR}
                                            className="flex items-center justify-center gap-2 w-full py-4 bg-slate-950 text-white font-semibold rounded-[1.25rem] shadow-md transition-all active:scale-[0.98] hover:bg-slate-900"
                                        >
                                            <ShareNetwork weight="fill" className="w-5 h-5" />
                                            Share QR to GPay
                                        </button>

                                        <button
                                            onClick={downloadQR}
                                            className="flex items-center justify-center gap-2 w-full py-4 bg-white text-slate-700 font-semibold rounded-[1.25rem] border border-slate-200 transition-all active:scale-[0.98] hover:bg-slate-50"
                                        >
                                            <DownloadSimple className="w-5 h-5" />
                                            Save QR Code
                                        </button>
                                    </div>

                                    <div className="mt-8 w-full flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="flex items-center gap-2.5 text-slate-600 text-sm font-medium">
                                            <span className="relative flex h-2.5 w-2.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-500"></span>
                                            </span>
                                            Awaiting Payment
                                        </div>
                                        <div className={`flex items-center gap-1.5 text-sm font-mono font-semibold ${
                                            timeLeft <= 60 ? 'text-red-500' : 'text-slate-500'
                                        }`}>
                                            <Timer className="w-4 h-4" />
                                            {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {status === 'expired' && (
                                <motion.div
                                    key="expired"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex flex-col items-center justify-center py-10 text-slate-500 relative z-10"
                                >
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                    >
                                        <XCircle weight="fill" className="w-20 h-20 mb-6 text-slate-400" />
                                    </motion.div>
                                    <h3 className="text-2xl font-bold tracking-tight text-slate-900">QR Expired</h3>
                                    <p className="text-sm text-slate-500 mt-2 text-center">This ticket has expired.<br />Please generate a new one.</p>
                                    <button
                                        onClick={() => {
                                            setSearchParams({});
                                            setStatus('idle');
                                            setUpiString('');
                                            setTimeLeft(0);
                                        }}
                                        className="mt-6 w-full flex items-center justify-between bg-slate-950 text-white rounded-[1.25rem] py-4 px-6 font-semibold transition-all active:scale-[0.98] hover:bg-slate-800"
                                    >
                                        <span>Generate New Pass</span>
                                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10">
                                            <ArrowRight className="w-4 h-4" />
                                        </span>
                                    </button>
                                </motion.div>
                            )}

                            {status === 'paid' && (
                                <motion.div
                                    key="paid"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex flex-col items-center justify-center py-10 text-emerald-600 relative z-10"
                                >
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                    >
                                        <CheckCircle weight="fill" className="w-20 h-20 mb-6" />
                                    </motion.div>
                                    <h3 className="text-2xl font-bold tracking-tight text-slate-900">Payment Verified</h3>
                                    <p className="text-sm text-slate-500 mt-2">Issuing your ticket...</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default RegisterEvent;
