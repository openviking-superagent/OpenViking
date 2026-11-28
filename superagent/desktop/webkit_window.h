/* Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
   SPDX-License-Identifier: AGPL-3.0

   The smallest WebKitGTK window that will hold the shell page: one GTK window,
   one WebKit view, and the GTK main loop. The package-config line that picks
   WebKitGTK 4.1 or 4.0 lives in the Go file that includes this header. */

#ifndef OVSA_WEBKIT_WINDOW_H
#define OVSA_WEBKIT_WINDOW_H

#include <gtk/gtk.h>
#include <webkit2/webkit2.h>

static void ovsa_on_destroy(GtkWidget *widget, gpointer data) {
  (void)widget;
  (void)data;
  gtk_main_quit();
}

static void ovsa_open_window(const char *url) {
  gtk_init(NULL, NULL);
  GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
  gtk_window_set_title(GTK_WINDOW(window), "OpenViking SuperAgent");
  gtk_window_set_default_size(GTK_WINDOW(window), 1280, 860);
  gtk_window_set_position(GTK_WINDOW(window), GTK_WIN_POS_CENTER);
  g_signal_connect(window, "destroy", G_CALLBACK(ovsa_on_destroy), NULL);
  GtkWidget *view = webkit_web_view_new();
  gtk_container_add(GTK_CONTAINER(window), view);
  webkit_web_view_load_uri(WEBKIT_WEB_VIEW(view), url);
  gtk_widget_show_all(window);
  gtk_main();
}

#endif
