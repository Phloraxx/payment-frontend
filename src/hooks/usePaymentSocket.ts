import { useEffect, useState } from 'react';

const API_URL = 'https://payment-api.nerdpixel.workers.dev/api';

export default function usePaymentSocket(ticketId: string | null) {
    const [isPaid, setIsPaid] = useState(false);

    useEffect(() => {
        if (!ticketId) return;

        const wsUrl = `${API_URL.replace(/^https?/, 'wss')}/ws?ticketId=${ticketId}`;
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => console.log('Listening securely for payment updates…');

        socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === 'payment_update' && payload.status === 'paid') {
                    console.log('PAYMENT DETECTED at:', payload.paidAt);
                    setIsPaid(true);
                    socket.close();
                }
            } catch (err) {
                console.error('Failed to parse socket message', err);
            }
        };

        socket.onclose = () => {
            console.log('Socket closed.');
        };

        socket.onerror = (error) => {
            // ignore closed-before-open errors from strict mode
            if (socket.readyState === WebSocket.CLOSED) return;
            console.error('WebSocket error:', error);
        };

        return () => {
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                socket.close();
            }
        };
    }, [ticketId]);

    return isPaid;
}
