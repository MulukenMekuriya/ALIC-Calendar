/**
 * Ministry Justification Categories
 *
 * Each ministry has predefined budget categories that were approved.
 * This allows tracking of expense requests against approved budget items.
 *
 * "Other (Please Specify)" is automatically added as the last option for each ministry.
 */

export const MINISTRY_JUSTIFICATIONS: Record<string, string[]> = {
  // 1. MD Prayer
  "Alic MD Prayer": ["Yearly prayer mountain trip"],

  // 2. MD Leadership (maps to ALIC Leaders Council)
  "ALIC Leaders Council": [
    "Ministry leaders training quarterly",
    "Love gifts for invited guests",
    "Ministries and Leadership related costs",
  ],

  // 3. MD Media
  "Alic MD Media": ["Keyboard", "Monitor", "Drum sub", "Drum set accessories"],

  // 4. MD Music
  "Alic MD Music": [
    "Camera lens",
    "SD Cards(x2)",
    "Gimbals",
    "SSD drive",
    "PowerBank(3X)",
    "Tripods(3x)",
    "Back lights(2x)",
  ],

  // 5. MD Young Adult
  "Alic MD Young Adult": [
    "Yearly Retreat",
    "Yearly Outreach 1 - T-Shirt and Tracts Printing",
    "Yearly Outreach 2 - T-Shirt and Tracts Printing",
    "10 Year Celebration Program",
    "Weekly Service",
    "Guest Speakers and/or Ministers",
    "Worship Ministry",
    "Social Media Engagement",
    "Fellowship/Participants engagement",
  ],

  // 6. MD Deacons
  "Alic MD Deacons": [
    "Office Supplies",
    "Lord's supper Preparation Expense",
    "Catering cost on New Year & Thanksgiving",
    "Deacons Retreat Session (Matching Fund)",
  ],

  // 7. MD Women
  "Alic MD Women's": [
    "Monthly Meeting",
    "Support for retreat",
    "Training (invite guests)",
  ],

  // 8. MD Men
  "Alic MD Men's": [
    "Annual ALIC Men's Retreat support",
    "Group Leaders & Coordinators Meeting",
    "All Men's Meeting",
    "All Men's Virtual Meeting Every 3 months",
  ],

  // 9. MD Evangelism & Discipleship
  "Alic MD Evangelism": [
    "T-Shirt",
    "Track Printing",
    "Posters",
    "Salivation Class Baptism",
    "Discipleship 101 Fellowship",
    "Discipleship 102 Fellowship",
    "Outreach New York",
    "Outreach New Carolina",
    "Outreach Ohio",
    "Outreach Lancaster",
    "Outreach Baltimore",
    "Outreach Virginia",
  ],

  // Also add for Teaching & Discipleship ministry
  "Alic MD Teaching &Dicipleshipe": [
    "T-Shirt",
    "Track Printing",
    "Posters",
    "Salivation Class Baptism",
    "Discipleship 101 Fellowship",
    "Discipleship 102 Fellowship",
    "Outreach New York",
    "Outreach New Carolina",
    "Outreach Ohio",
    "Outreach Lancaster",
    "Outreach Baltimore",
    "Outreach Virginia",
  ],

  // 10. MD Youth
  "Alic MD Youth": [
    "Spiritual Growth Activities",
    "Leadership Development",
    "Mentorship and Discipleship",
    "Community Engagement and Volunteerism",
    "Worship and Ministry Involvement",
    "Fellowship and Social Events",
    "Parent and Family Involvement",
    "Outreach and Evangelism",
    "Special Events",
    "Regular Feedback and Continuous Improvement",
  ],

  // 11. MD True Vine
  "Alic MD True Vine": [
    "Overseers",
    "Media Department",
    "Evangelism Department",
    "Men's Ministry",
    "Women's Ministry",
    "Coordination Department",
    "Discipleship Department",
    "Prayer Department",
    "Worship Department",
    "Bible Studies Department",
    "Foundations Department",
  ],

  // 12. MD HA Choir
  "Alic MD Ha Choir": [
    "Recording Songs (2 songs)",
    "Speaker (Portable PA System - 1600W Active Bluetooth Compatible)",
    "Electric Guitar with all accessories",
    "Stand and pedal for the Keyboard",
    "Training Sessions (2 training sessions)",
    "Get-together",
    "Printing (Choir Songs)",
  ],

  // 13. MD Worship B
  "Alic MD Worship B (Aroma)": [
    "Teaching",
    "Vocal training",
    "Retreat support",
    "Worship team get together",
    "Clothes",
    "Music Band",
    "10th Year Anniversary",
  ],

  // 14. MD Children
  "Alic MD Children": [
    "Parents Training",
    "Baptism",
    "VBS",
    "Parents equip and back to school night",
    "Volunteer/Teachers equip",
    "Christmas party",
    "Curriculum",
    "Miscellaneous",
  ],

  // 15. MD Home Cell (Bible Study groups)
  "Alic MD Home Cell": [
    "Study leaders meeting",
    "Training for previous and new leaders",
    "Home cell groups Unity Day",
    "Coordinator's retreat matching fund",
    "Home cell groups outdoor gatherings",
  ],

  // 16. MD Welcome
  "Alic MD Welcome": [
    "Welcome and celebration for new members",
    "Home visit for sick members",
  ],

  // Also add ALIC Welcome
  "ALIC Welcome": [
    "Welcome and celebration for new members",
    "Home visit for sick members",
  ],

  // 17. MD Senior's
  "Alic MD Senior's": ["Fellowship"],

  // 18. MD Holistic
  "Alic MD Holistic": [
    "Support for Church Members in need",
    "Education and Training",
  ],

  // 19. MD Counseling & Marriage
  "Alic MD Counseling & Marriage": [
    "Couples' Special Program",
    "Singles Special Program",
    "Couples Fellowship Leaders Training",
  ],

  // 20. MD Serving
  "ALIC MD Serving Ministry": ["Fellowship", "Workshop"],

  // 21. MD Grace
  "Alic MD Grace": [
    "Training and development for volunteers",
    "Ministers' prayer and training",
    "Weekly service snacks",
    "Curriculum development and adaptive resources and materials for disability-inclusive studies",
    "Hosting inclusive events, workshops, and community outreach initiatives",
    "Unforeseen expenses and adjustments to the budget",
  ],

  // 22. MD Visiting
  "ALIC Visiting": ["Visiting members meeting"],

  // 23. MD IT
  "Alic MD IT": [
    "Software and Online monthly Subscriptions",
    "Miscellaneous Expense",
  ],

  // 24. MD Parking
  "Alic MD Parking": ["Miscellaneous Expense"],

  // =====================================================
  // VA Ministries (Virginia)
  // =====================================================

  // VA Children
  "VA Children": [
    "Sunday School Material",
    "Children Verse Study",
    "Children's Choir",
    "Family and Teachers' Fellowship",
    "Special Session for Kids on Holidays",
    "Seminar for Families",
    "Sunday School Teachers' Fellowship",
    "Field Trip to Fellowship with Kids",
    "Vacation Bible School (VBS)",
    "Translating Teaching Resources",
    "Resources for Foundation Class",
  ],

  // VA Choir
  "VA Choir": [
    "Musical Instrument Training for Talented Individuals",
    "Choirs' Refreshment",
  ],

  // VA Coord. Office
  "VA Coord. Office": [
    "Project Management Software License",
    "Cross Training with Other Ministry Leaders",
  ],

  // VA Deacons
  "VA Deacons": [
    "After Service Fellowship Snacks",
    "Holy Communion Preparation",
    "Church Vision Sharing for Newcomers Lunch",
    "Cleaning Services",
    "Thanksgiving and New Year Services",
  ],

  // VA Discipleship
  "VA Discipleship": [
    "Quarterly Fellowship (101)",
    "Quarterly Fellowship (102)",
    "Books for Class (101 & 102)",
    "Class Completion (102)",
  ],

  // VA Evangelism
  "VA Evangelism": [
    "Print Tracts / Flyers / Brochures",
    "Homeless Shelter Visit",
    "Training for Church Members",
  ],

  // VA Family
  "VA Family": [
    "Singles Program (with Young Adult)",
    "Couples Dinner",
    "Family Conference",
    "Family Cookout / BBQ",
    "Family Discussion Session",
  ],

  // VA Holistic
  "VA Holistic": ["Support for Church Members in Need"],

  "VA Bible Study": [
    "Meeting & Fellowship with Bible Study Leaders",
    "Training Materials and Books",
    "Training New Bible Study Leaders",
    "All Bible Study Groups Fellowship",
  ],

  // VA Coordination team alternate names
  "VA Coordination": [
    "Project Management Software License",
    "Cross Training with Other Ministry Leaders",
  ],

  // VA Leadership
  "VA Leadership": [
    "Salvation Class Special Program",
    "Ministry Leaders Training (Quarterly)",
    "All Ministers Training",
    "Prayer and Retreat",
    "Conference",
  ],

  // VA Media
  "VA Media": ["Post-production", "Media Equipment"],

  // VA Men's
  "VA Men's": [
    "Men's Special Workshop (Invited Guest)",
    "Men's Fellowship Session #1",
    "Annual ALIC Men's Retreat",
    "Men's Fellowship Session #2",
    "Men's Summer Fellowship Day",
    "Men's Fellowship Session #3",
    "Men's Dinner Night (Career Mentoring at Church)",
  ],

  // VA Prayer
  "VA Prayer": [
    "Prayer with Young Adult & Discussion Session",
    "Fasting and Prayer",
    "Love Gifts for Invited Guests",
  ],

  // VA Welcoming Team
  "VA Welcoming Team": [
    "Prayer and Discussion Sessions",
    "Welcoming Congregation for Holidays",
    "Fellowship After Service",
    "Welcoming Team Uniforms",
  ],

  // VA Women's
  "VA Women's": [
    "Holistic Health Training for Women",
    "Weekend Retreat for Spiritual Renewal",
    "Fellowship & Relationship Building",
    "Strengthening Women's Spiritual Walk",
  ],

  // VA Young Adult
  "VA Young Adult": [
    "Young Adult Conference",
    "Retreat",
    "Concert",
    "Holiday Celebration Event",
  ],

  // VA Youth
  "VA Youth": [
    "Youth Fellowship",
    "Trainings / Discussions",
    "Bible for Students",
    "Summer Retreat",
    "Senior Send-out",
    "College Students Dinner",
    "Salvation and Discipleship",
    "Holiday Celebration for Youth",
  ],

  // =====================================================
  // ALIC VA Ministries (exact database names)
  // =====================================================

  "ALIC VA Bible Study": [
    "Meeting & Fellowship with Bible Study Leaders",
    "Training Materials and Books",
    "Training New Bible Study Leaders",
    "All Bible Study Groups Fellowship",
  ],

  "ALIC VA Children": [
    "Sunday School Material",
    "Children Verse Study",
    "Children's Choir",
    "Family and Teachers' Fellowship",
    "Special Session for Kids on Holidays",
    "Seminar for Families",
    "Sunday School Teachers' Fellowship",
    "Field Trip to Fellowship with Kids",
    "Vacation Bible School (VBS)",
    "Translating Teaching Resources",
    "Resources for Foundation Class",
  ],

  "ALIC VA Choir": [
    "Musical Instrument Training for Talented Individuals",
    "Choirs' Refreshment",
  ],

  "ALIC VA Coordination": [
    "Project Management Software License",
    "Cross Training with Other Ministry Leaders",
  ],

  "ALIC VA Deacons": [
    "After Service Fellowship Snacks",
    "Holy Communion Preparation",
    "Church Vision Sharing for Newcomers Lunch",
    "Cleaning Services",
    "Thanksgiving and New Year Services",
  ],

  "ALIC VA Discipleship": [
    "Quarterly Fellowship (101)",
    "Quarterly Fellowship (102)",
    "Books for Class (101 & 102)",
    "Class Completion (102)",
  ],

  "ALIC VA Evangelism": [
    "Print Tracts / Flyers / Brochures",
    "Homeless Shelter Visit",
    "Training for Church Members",
  ],

  "ALIC VA Family": [
    "Singles Program (with Young Adult)",
    "Couples Dinner",
    "Family Conference",
    "Family Cookout / BBQ",
    "Family Discussion Session",
  ],

  "ALIC VA Leaders": [
    "Salvation Class Special Program",
    "Ministry Leaders Training (Quarterly)",
    "All Ministers Training",
    "Prayer and Retreat",
    "Conference",
  ],

  "ALIC VA Media": [
    "Post-production",
    "Media Equipment",
  ],

  "ALIC VA Men": [
    "Men's Special Workshop (Invited Guest)",
    "Men's Fellowship Session #1",
    "Annual ALIC Men's Retreat",
    "Men's Fellowship Session #2",
    "Men's Summer Fellowship Day",
    "Men's Fellowship Session #3",
    "Men's Dinner Night (Career Mentoring at Church)",
  ],

  "ALIC VA Prayer": [
    "Prayer with Young Adult & Discussion Session",
    "Fasting and Prayer",
    "Love Gifts for Invited Guests",
  ],

  "ALIC VA Welcome": [
    "Prayer and Discussion Sessions",
    "Welcoming Congregation for Holidays",
    "Fellowship After Service",
    "Welcoming Team Uniforms",
  ],

  "ALIC VA Women": [
    "Holistic Health Training for Women",
    "Weekend Retreat for Spiritual Renewal",
    "Fellowship & Relationship Building",
    "Strengthening Women's Spiritual Walk",
  ],

  "ALIC VA Young Adult": [
    "Young Adult Conference",
    "Retreat",
    "Concert",
    "Holiday Celebration Event",
  ],

  "ALIC VA Youth": [
    "Youth Fellowship",
    "Trainings / Discussions",
    "Bible for Students",
    "Summer Retreat",
    "Senior Send-out",
    "College Students Dinner",
    "Salvation and Discipleship",
    "Holiday Celebration for Youth",
  ],
};

// Special value for "Other" option
export const OTHER_JUSTIFICATION_VALUE = "__other__";
export const OTHER_JUSTIFICATION_LABEL = "Other (Please Specify)";

/**
 * Get justification options for a ministry
 * Returns the predefined categories plus "Other (Please Specify)" at the end
 */
export function getJustificationsForMinistry(ministryName: string): string[] {
  // Try exact match first
  if (MINISTRY_JUSTIFICATIONS[ministryName]) {
    return MINISTRY_JUSTIFICATIONS[ministryName];
  }

  // Try case-insensitive match
  const normalizedName = ministryName.toLowerCase().trim();
  for (const [key, values] of Object.entries(MINISTRY_JUSTIFICATIONS)) {
    if (key.toLowerCase().trim() === normalizedName) {
      return values;
    }
  }

  // Try matching by extracting "MD ..." part from ministry name
  // This handles cases like "Alic MD Media" matching "MD Media"
  const mdMatch = ministryName.match(/MD\s+.+/i);
  if (mdMatch) {
    const mdPart = mdMatch[0];
    for (const [key, values] of Object.entries(MINISTRY_JUSTIFICATIONS)) {
      if (key.toLowerCase().trim() === mdPart.toLowerCase().trim()) {
        return values;
      }
    }
  }

  // Try partial match - check if ministry name contains any key
  for (const [key, values] of Object.entries(MINISTRY_JUSTIFICATIONS)) {
    if (normalizedName.includes(key.toLowerCase())) {
      return values;
    }
  }

  // Return empty array if no match (will only show "Other" option)
  return [];
}

/**
 * Check if a ministry has predefined justifications
 */
export function ministryHasJustifications(ministryName: string): boolean {
  return getJustificationsForMinistry(ministryName).length > 0;
}
