#!/bin/bash

# Email Notification Function Deployment Script
# This script helps deploy the send-event-notification function

echo "======================================"
echo "Email Notification Function Deployment"
echo "======================================"
echo ""

# Check if RESEND_API key is needed
echo "Step 1: Setting RESEND_API secret"
echo "-----------------------------------"
read -p "Do you have a Resend API key? (y/n): " has_key

if [ "$has_key" = "y" ]; then
    read -p "Enter your Resend API key: " api_key

    echo "Setting RESEND_API secret..."
    npx supabase secrets set RESEND_API="$api_key"

    if [ $? -eq 0 ]; then
        echo "✓ RESEND_API secret set successfully"
    else
        echo "✗ Failed to set RESEND_API secret"
        echo "You may need to run: npx supabase link first"
        exit 1
    fi
else
    echo "⚠ You'll need to get a Resend API key from https://resend.com/api-keys"
    echo "Then run: npx supabase secrets set RESEND_API=your_key_here"
fi

echo ""
echo "Step 2: Deploying function"
echo "-----------------------------------"

# Check if we should deploy locally or to production
read -p "Deploy to (l)ocal or (p)roduction? (l/p): " deploy_target

if [ "$deploy_target" = "p" ]; then
    echo "Deploying to production..."
    npx supabase functions deploy send-event-notification --no-verify-jwt
else
    echo "For local development, the function should auto-reload."
    echo "If you need to manually restart, use:"
    echo "  npx supabase functions serve send-event-notification"
fi

echo ""
echo "Step 3: Verify deployment"
echo "-----------------------------------"
echo "To test the function:"
echo "1. Open test-email-notification.html in your browser"
echo "2. Or test through the admin panel"
echo "3. Check logs with: npx supabase functions logs send-event-notification"
echo ""
echo "Refer to EMAIL_TESTING_GUIDE.md for detailed testing instructions."
echo ""
echo "======================================"
echo "Deployment Complete!"
echo "======================================"
