# Check-in label printing

How to set up an iPad and a Brother QL-820NWB so the children's check-in tags
print correctly, and what to do when they don't.

Everything here is a one-time setup per device. It takes about five minutes.

---

## What you need

| | |
|---|---|
| Printer | Brother QL-820NWB |
| Labels | **DK-1202** — 62 × 100mm die-cut shipping labels |
| Network | The printer and the iPad on the **same Wi-Fi network** |

The label size matters. The tag layout is drawn for a 62 × 100mm die-cut and
nothing else. Continuous roll (DK-2205) will print, but the tags will not be
cut where the design expects.

---

## Setting up a new iPad

1. **Put the printer on the church Wi-Fi.** Not Wi-Fi Direct — the iPad has to
   reach it over the normal network. On the printer: Menu → WLAN →
   Infrastructure Mode, then pick the church network.
2. **Check AirPrint is on.** Printer Setting Tool → Communication settings →
   AirPrint enabled. It is on by default, but a factory reset turns it off.
3. **Open the check-in page on the iPad** in Safari and sign in.
4. **Do one test check-in** with a real or test family, and let it reach the
   print step.
5. **In the print sheet that appears**, tap the printer name, then set:
   - **Printer:** Brother QL-820NWB
   - **Paper Size:** **62 × 100mm** — this is the important one, see below
   - **Copies:** 1
6. Print, and check the tag against the ones from a working station.

**Step 5 is the one that gets missed.** Safari will not let a web page choose
the paper — that setting lives in the print sheet and nowhere else, and the app
has no way to reach it. The iPad remembers the choice per printer, so it only
has to be done once, but a new iPad, a re-added printer or a reset of the
device's print settings all start again from Letter.

---

## When something goes wrong

### Pages of the check-in screen come out instead of tags

The iPad is running an old version of the app. A browser tab that has been open
since before a release keeps running the code it loaded; it does not update on
its own.

**Fix:** close the tab completely in the tab switcher — not just navigate away —
and open the station again. If the page is on the home screen as an app,
force-quit it.

The app now watches for this by itself: an unattended station reloads quietly
when nothing is happening, and a staffed screen offers a **Reload** button. If
you still see this, the device is running a build from before that was added,
and closing the tab is the cure.

### The tag prints small, off-centre, or with the date and page numbers around it

The paper is set to Letter or A4. Go back to step 5 above and set it to
62 × 100mm.

### The printer isn't in the list

- Is the iPad on the same Wi-Fi as the printer? A guest network will not see it.
- Is the printer in Wi-Fi Direct mode? Switch it to Infrastructure.
- Has the printer got an IP address? Menu → WLAN → WLAN Status.
- Try printing any web page from Safari. If the printer is missing there too,
  it is the network or the printer, not the check-in app.

### Blank labels, or each tag split across two

The wrong label roll. Check it is DK-1202 (62 × 100mm die-cut), and that the
printer has recognised it — the QL-820NWB reads the roll automatically, so if
it was changed with the power on, turn it off and on.

### The label is fine but the printer keeps feeding extra blanks

The roll is set as continuous rather than die-cut. Power-cycle the printer with
the correct roll loaded so it re-reads it.

---

## If it keeps drifting

Everything above depends on Safari's print sheet keeping a setting nobody can
verify remotely. If that becomes a recurring Sunday morning problem, the
permanent answer is not more setup instructions: it is a small print service on
the church network that talks to the QL-820NWB directly on port 9100, which
takes the browser out of printing entirely. That is a piece of work, not a
setting — but it ends this category of problem for good.
