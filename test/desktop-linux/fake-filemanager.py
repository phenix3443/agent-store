#!/usr/bin/env python3
"""Stands in for a desktop file manager on the session bus (org.freedesktop.FileManager1), the
service tauri-plugin-opener's revealItemInDir calls on Linux. Appends every URI it is asked to
show to the file given as the first argument."""
import sys

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

OUT = sys.argv[1]
IFACE = 'org.freedesktop.FileManager1'


class FileManager(dbus.service.Object):
    def record(self, kind, uris):
        with open(OUT, 'a') as f:
            for uri in uris:
                f.write(f'{kind} {uri}\n')

    @dbus.service.method(IFACE, in_signature='ass', out_signature='')
    def ShowItems(self, uris, _startup_id):
        self.record('items', uris)

    @dbus.service.method(IFACE, in_signature='ass', out_signature='')
    def ShowFolders(self, uris, _startup_id):
        self.record('folders', uris)

    @dbus.service.method(IFACE, in_signature='ass', out_signature='')
    def ShowItemProperties(self, uris, _startup_id):
        self.record('properties', uris)


DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
name = dbus.service.BusName(IFACE, bus)
FileManager(bus, '/org/freedesktop/FileManager1')
open(OUT, 'a').close()
GLib.MainLoop().run()
