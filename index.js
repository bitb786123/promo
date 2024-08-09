const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const moment = require('moment'); // For handling dates

const app = express();

// Serve static files from the "public" directory
app.use(express.static('public'));

// Path to the JSON files
const promoCodesFilePath = path.join(__dirname, 'promo-codes.json');
const redeemedCodesFilePath = path.join(__dirname, 'redeemed-codes.json');

// Function to generate a random promo code
const generatePromoCode = () => {
    return 'PROMO-' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

// Function to load existing promo codes from JSON file
const loadPromoCodes = () => {
    if (fs.existsSync(promoCodesFilePath)) {
        const data = fs.readFileSync(promoCodesFilePath);
        return JSON.parse(data);
    }
    return [];
};

// Function to save promo codes to JSON file
const savePromoCodes = (promoCodes) => {
    fs.writeFileSync(promoCodesFilePath, JSON.stringify(promoCodes, null, 2));
};

// Function to load redeemed promo codes from JSON file
const loadRedeemedCodes = () => {
    if (fs.existsSync(redeemedCodesFilePath)) {
        const data = fs.readFileSync(redeemedCodesFilePath);
        return JSON.parse(data);
    }
    return [];
};

// Function to save redeemed promo codes to JSON file
const saveRedeemedCodes = (redeemedCodes) => {
    fs.writeFileSync(redeemedCodesFilePath, JSON.stringify(redeemedCodes, null, 2));
};

// Function to create a PDF with multiple pages if needed
const createPDF = async (promoCodes, filePath) => {
    return new Promise(async (resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A5',
            margin: 30
        });

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Define content to be included on each page
        const addIntroContent = () => {
            doc.fontSize(22).font('Helvetica-Bold').text('Thank You!', {
                align: 'center',
                underline: true
            });

            doc.moveDown();

            doc.fontSize(16).font('Helvetica').text('We sincerely appreciate your order with us.', {
                align: 'center'
            });

            doc.moveDown();

            doc.fontSize(14).font('Helvetica').fillColor('#555').text('We value your feedback and would love to hear from you!', {
                align: 'center'
            });

            doc.moveDown();

            doc.fontSize(14).font('Helvetica-Bold').fillColor('#007bff').text('Send your feedback via WhatsApp:', {
                align: 'center'
            });

            doc.moveDown();

            doc.fontSize(12).font('Helvetica').text('Contact us at: +03093621396', {
                align: 'center'
            });

            doc.moveDown();

            doc.fontSize(16).font('Helvetica-Bold').fillColor('#007bff').text('Enjoy a 10% Discount on Your Next Purchase!', {
                align: 'center',
                underline: true
            });

            doc.moveDown();
        };

        // Iterate through promo codes and create a page for each
        for (const promoCode of promoCodes) {
            if (promoCodes.indexOf(promoCode) > 0) {
                doc.addPage();
            }
            
            // Add introductory content on every page
            addIntroContent();

            // Promo Code
            doc.fontSize(18).font('Helvetica-Bold').fillColor('#007bff').text('Promo Code:', {
                align: 'center'
            });

            doc.fontSize(22).font('Helvetica-Bold').fillColor('#007bff').text(promoCode.code, {
                align: 'center',
                underline: true
            });

            doc.moveDown(1);

            // Redemption Instructions
            doc.fontSize(14).font('Helvetica').fillColor('#333').text('To Redeem Your Promo Code:', {
                align: 'center',
                underline: true
            });

            doc.moveDown();

            doc.fontSize(12).font('Helvetica').text(
                `1. Scan the QR code below to open our WhatsApp chat.\n` +
                `2. Send us a message with the promo code "${promoCode.code}".\n` +
                `3. Enjoy a 10% discount on your next purchase!`,
                {
                    align: 'center',
                    width: doc.page.width - 60 // Adjust text width for better alignment
                }
            );

            doc.moveDown(1);

            // QR Code for WhatsApp with Promo Code
            const qrCodeData = `https://wa.me/03093621396?text=I%20want%20to%20redeem%20the%20promo%20code%20${promoCode.code}%20and%20want%20to%20shop.`;
            const qrCodePath = path.join(__dirname, 'feedback-qr.png');

            try {
                await QRCode.toFile(qrCodePath, qrCodeData, {
                    width: 120,
                    margin: 1
                });

                // Center QR code
                doc.image(qrCodePath, {
                    fit: [120, 120],
                    align: 'center',
                    valign: 'center',
                    x: (doc.page.width - 120) / 2 // Center horizontally
                });

                // Clean up QR code file
                fs.unlinkSync(qrCodePath);
            } catch (error) {
                console.error('Error generating QR code:', error);
                doc.text('Error generating QR code.', {
                    align: 'center'
                });
            }

            doc.moveDown();
        }

        // Finalize the PDF
        doc.end();

        stream.on('finish', () => {
            resolve();
        });

        stream.on('error', (err) => {
            reject(err);
        });
    });
};

// Route to generate a single PDF with multiple pages containing unique promo codes
app.get('/generate-pdfs', async (req, res) => {
    try {
        const amount = parseInt(req.query.amount, 10) || 1;
        const promoCodes = [];

        for (let i = 0; i < amount; i++) {
            const promoCode = generatePromoCode();
            const expirationDate = moment().add(15, 'days').format('YYYY-MM-DD');
            promoCodes.push({
                code: promoCode,
                generatedAt: moment().format('YYYY-MM-DD'),
                expiresAt: expirationDate
            });
        }

        // Save promo codes to JSON file
        const existingPromoCodes = loadPromoCodes();
        const allPromoCodes = existingPromoCodes.concat(promoCodes);
        savePromoCodes(allPromoCodes);

        const filePath = path.join(__dirname, `promo-codes.pdf`);

        await createPDF(promoCodes, filePath);

        res.sendFile(filePath, (err) => {
            if (err) {
                console.error('Error sending the file:', err);
            }
            fs.unlinkSync(filePath);
        });
    } catch (error) {
        console.error('Error generating PDFs:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route to validate promo code
app.get('/validate-promo-code', (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.status(400).send('Promo code is required');
    }

    let promoCodes = loadPromoCodes();
    let redeemedCodes = loadRedeemedCodes();

    const promoCodeIndex = promoCodes.findIndex(p => p.code === code && moment(p.expiresAt).isAfter(moment()));

    if (promoCodeIndex === -1) {
        return res.status(400).send('Invalid or expired promo code');
    }

    // Move promo code to redeemed codes
    const [redeemedCode] = promoCodes.splice(promoCodeIndex, 1);
    redeemedCodes.push(redeemedCode);

    savePromoCodes(promoCodes);
    saveRedeemedCodes(redeemedCodes);

    res.send('Promo code successfully redeemed');
});

// Serve redemption page
app.get('/redeem', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'redeem.html'));
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
