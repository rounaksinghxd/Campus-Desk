package com.campusdesk.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (this.bridge != null) {
            this.bridge.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri url = request != null ? request.getUrl() : null;
                    if (url != null) {
                        String scheme = url.getScheme();
                        if ("tel".equalsIgnoreCase(scheme)) {
                            try {
                                Intent dialIntent = new Intent(Intent.ACTION_DIAL, url);
                                startActivity(dialIntent);
                            } catch (ActivityNotFoundException ignored) {
                                // Device has no phone dialer installed
                            }
                            return true;
                        }
                        if ("mailto".equalsIgnoreCase(scheme)) {
                            try {
                                Intent mailIntent = new Intent(Intent.ACTION_SENDTO, url);
                                startActivity(mailIntent);
                            } catch (ActivityNotFoundException ignored) {
                                // Device has no email client installed
                            }
                            return true;
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }
}
