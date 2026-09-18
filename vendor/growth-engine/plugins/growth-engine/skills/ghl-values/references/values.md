# Every custom value, by pack

A founder fills the **Essentials** list for their snapshot, and the list for **every pack** in it. The B2B snapshot uses B2B Essentials. The B2C and Hybrid snapshots use B2C Essentials, so a Hybrid founder writes `Customer Welcome Subject` and `Customer Welcome Body`, never the Client pair, even on the B2B track. The Hybrid snapshot has that one Essentials list and all six packs. Nothing else. The pack named in `ops-workflow.md` is written first. A file made in the app calls that pack a snapshot, and `Comment-to-DM capture` there is the `Comment to DM` pack here.

The key is what the workflow step uses, written `{{custom_values.<key>}}`. GoHighLevel builds the key from the name when the value is created, so a value must never be renamed afterwards: every step that uses it would go blank.

Values whose names appear in both Essentials packs are one value in an account. A name exists once.


## B2B Essentials (11)

| Value | Key | What goes in it |
|---|---|---|
| Greeting | `greeting` | The one word every email opens with, before their first name: Hi, Hey, Hello or Good morning. One word, no comma and no name: the step adds a space, their first name and the comma. |
| Welcome Email Subject | `welcome_email_subject` | The subject line of your welcome email. A few plain words that show it is your reply, such as a thank you for getting in touch. |
| Welcome Email Body | `welcome_email_body` | Two or three short paragraphs. It goes out within about a minute of the form being sent, before you have read their message, so thank them, say you have their message and how you will reply, and do not try to answer their question. |
| Met You Email Subject | `met_you_email_subject` | A few plain words, such as a note that it was good to meet. It must fit anyone you meet, at any event. |
| Met You Email Body | `met_you_email_body` | Two or three short paragraphs. It goes out within about a minute of them sending your Event contact form, often while you are still at the event. |
| Met You Follow Up Subject | `met_you_follow_up_subject` | A few plain words for the one follow up sent two days after your Met You email. Write the subject to read well without their name. |
| Met You Follow Up Body | `met_you_follow_up_body` | One or two short paragraphs, sent two days after the Met You email, unless they replied or sent your Enquiry form in the meantime. Pick up from your first email, ask one question they can answer in a line, and do not pitch. |
| Check Back Subject | `check_back_subject` | A few plain words for the one check back email, sent 60 days after you parked someone. It must fit anyone you park. |
| Check Back Body | `check_back_body` | One or two short paragraphs, sent once, 60 days after you added `do-check-back-later`, on a weekday between 08:00 and 18:00. Remind them briefly who you are in words that fit anyone you park, ask one question such as whether now is a better time, and make it easy to ignore. |
| Client Welcome Subject (optional) | `client_welcome_subject` | A few plain words that welcome a new client. Only needed if you switch on `Essentials 13: Welcome a new client` and `Essentials 14: When a deal is won for the first time`. |
| Client Welcome Body (optional) | `client_welcome_body` | Two or three short paragraphs, sent about a minute after you mark their first card Won. Thank them, say what happens next and how to reach you. |

**Contact fields this pack brings.** Not copy: they hold information about one person, and the workflow merges them into the message.

| Field | Merge tag | What it holds | Who fills it |
|---|---|---|---|
| Enquiry message | `{{contact.enquiry_message}}` | What the person wrote on your `Enquiry form` or your `Event contact form`, in their own words. On the event form the same field is labelled What would be useful? | The person, on either form. It is never required, so it can arrive empty. You can also type into it yourself on their contact record. |
| Personal line | `{{contact.personal_line}}` | One or two sentences written for that one person, in your words: something only they would recognise. | You, by hand on their contact record, before the first email that chases someone is due. It is on no form, and no automation waits for it. |

## B2B Lead follow-up (6)

| Value | Key | What goes in it |
|---|---|---|
| Lead Chase 1 Subject | `lead_chase_1_subject` | The subject of the first chase email, from your growth-engine/ops-workflow.md if it has one. A few plain words that make sense on their own. |
| Lead Chase 1 Body | `lead_chase_1_body` | The body of the first chase email, two to four short sentences. It goes 2 days after the chase starts, usually 2 days after your welcome email. |
| Lead Chase 2 Subject | `lead_chase_2_subject` | The subject of the second chase email. A few plain words, different from chase 1. |
| Lead Chase 2 Body | `lead_chase_2_body` | The body of the second chase email, two to four short sentences, sent 4 days after chase 1. Take a different angle from chase 1, still with one question and no pitch. |
| Lead Last Email Subject | `lead_last_email_subject` | The subject of the last email. A few plain words. |
| Lead Last Email Body | `lead_last_email_body` | The body of the last email, two to four short sentences, sent 5 days after chase 2. It must say plainly that this is the last email you will send them about this, so they are not left wondering. |

## B2B Discovery booking (11)

| Value | Key | What goes in it |
|---|---|---|
| Call Booking Link | `call_booking_link` | Not words, and a value you cannot prepare in advance. At the clinic, open your own `Discovery call` calendar, click `Share`, then `Copy Link`, and paste the link and nothing else. |
| Call Link Email Subject | `call_link_email_subject` | The subject line of the email that sends your booking link. Copy it from `ops-workflow.md` in your growth-engine folder if it is already written there. |
| Call Link Email Body | `call_link_email_body` | The body of that email, with the booking link taken out, because the step puts the link on its own line underneath. Two to four short sentences: why a short call is worth their time, and an ask to pick a time from the link below. |
| Call Nudge Subject | `call_nudge_subject` | The subject line of the nudge sent 2 days after the booking link email to someone who has not booked or replied. Copy it from `ops-workflow.md` in your growth-engine folder if it is already written there. |
| Call Nudge Body | `call_nudge_body` | One to three sentences, with the link taken out. A light reminder with one reason to book, not the first email again. |
| Call Last Nudge Subject | `call_last_nudge_subject` | The subject line of the last nudge, sent 3 days after the nudge. Copy it from `ops-workflow.md` in your growth-engine folder if it is already written there. |
| Call Last Nudge Body | `call_last_nudge_body` | Two to four sentences, with the link taken out. Say this is the last email you will send about booking. |
| Call Missed Subject | `call_missed_subject` | The subject line of the email sent a day after you mark a call `No Show`. Copy it from `ops-workflow.md` in your growth-engine folder if it is already written there. |
| Call Missed Body | `call_missed_body` | Two or three sentences, with the link taken out. No blame, an easy way to book again through the link below, and a line saying this is the last email you will send about it. |
| Call Cancelled Subject | `call_cancelled_subject` | The subject line of the email sent straight after a lead cancels their call. Copy it from `ops-workflow.md` in your growth-engine folder if it is already written there. |
| Call Cancelled Body | `call_cancelled_body` | Two or three sentences, with the link taken out. Thank them for letting you know, and invite them to pick a new time through the link below if they still want to talk. |

## B2B Proposal chase (6)

If `ops-workflow.md` names a different pack, it holds no Proposal chase emails. Write these six fresh, to the shape each row gives.

| Value | Key | What goes in it |
|---|---|---|
| Proposal Check In Subject | `proposal_check_in_subject` | The subject line of your first follow-up email, the one that checks your proposal arrived. Copy it from ops-workflow.md in your growth-engine folder: it is the subject of the first Proposal chase email. |
| Proposal Check In Body | `proposal_check_in_body` | The body of that first follow-up email, from the same place in ops-workflow.md. Two to four short sentences. |
| Proposal Talk It Through Subject | `proposal_talk_it_through_subject` | The subject line of your second follow-up email, the one that offers a short call to talk the proposal through. Copy it from the second Proposal chase email in ops-workflow.md. |
| Proposal Talk It Through Body | `proposal_talk_it_through_body` | The body of that second email, from the same place in ops-workflow.md. Two to four short sentences offering a short call to go through the proposal and answer their questions. |
| Proposal Last Email Subject | `proposal_last_email_subject` | The subject line of your last follow-up email. Copy it from the third Proposal chase email in ops-workflow.md. |
| Proposal Last Email Body | `proposal_last_email_body` | The body of that last email, from the same place in ops-workflow.md. Two to four short sentences. |

## B2C Essentials (11)

| Value | Key | What goes in it |
|---|---|---|
| Greeting | `greeting` | The one word every email opens with, before their first name: Hi, Hey, Hello or Good morning. One word, no comma and no name: the step adds a space, their first name and the comma. |
| Welcome Email Subject | `welcome_email_subject` | One line of 3 to 8 plain words that thanks them for getting in touch, for example: Thanks for your message. No first name, and nothing in curly or square brackets: a custom value never holds a merge field, so write it to read well without a name. |
| Welcome Email Body | `welcome_email_body` | 2 to 4 short paragraphs, with a blank line between them, in your own voice. It goes out automatically before you have read their message, so thank them, say their message has reached you and that you will reply yourself, and do not answer their question yet. |
| Met You Email Subject | `met_you_email_subject` | One line of 3 to 8 plain words, for example: Good to meet you. No first name, and nothing in curly or square brackets: a custom value never holds a merge field, so write it to read well without a name. |
| Met You Email Body | `met_you_email_body` | 2 to 4 short paragraphs, with a blank line between them. They met you at a market, class, workshop or event and asked to hear from you. |
| Met You Follow Up Subject | `met_you_follow_up_subject` | One line of 3 to 8 plain words. No first name, and nothing in curly or square brackets: a custom value never holds a merge field, so write it to read well without a name. |
| Met You Follow Up Body | `met_you_follow_up_body` | 1 to 3 short paragraphs. It goes two days after the Met You email, at about the same time of day, and only if they have not replied or sent your `Enquiry form` since. |
| Check Back Subject | `check_back_subject` | One line of 3 to 8 plain words, for example: Checking in, as promised. No first name, and nothing in curly or square brackets: a custom value never holds a merge field, so write it to read well without a name. |
| Check Back Body | `check_back_body` | 1 to 3 short paragraphs. It goes about 60 days after you parked them, only on Monday to Saturday between 09:00 and 19:00. |
| Customer Welcome Subject (optional) | `customer_welcome_subject` | Only needed if you switch on `Essentials 13: Welcome a new customer`. One line of 3 to 8 plain words. |
| Customer Welcome Body (optional) | `customer_welcome_body` | Only needed if you switch the customer welcome on. It goes the moment you mark someone's card `Won`, once per person, so it must be finished, checked words. |

**Contact fields this pack brings.** Not copy: they hold information about one person, and the workflow merges them into the message.

| Field | Merge tag | What it holds | Who fills it |
|---|---|---|---|
| Enquiry message | `{{contact.enquiry_message}}` | What the person typed in the message box on the form. On the `Enquiry form` the box is labelled Enquiry message. On the `Event contact form` the same field is labelled **What would be useful?**, so both forms write into this one field. | The person, on either form. Never required, so plenty arrive empty. You can also type into it yourself on their contact record. |
| Personal line | `{{contact.personal_line}}` | One or two sentences written for this one person, in your own words: what they asked about, where you met them, what they said. Nothing that quotes a result, a number, a customer or a review you have not recorded. | You, by hand on their contact record. Nothing fills it in by itself, and no automation waits for it. |

## B2C Comment to DM (7)

| Value | Key | What goes in it |
|---|---|---|
| Comment Public Reply 1 | `comment_public_reply_1` | One short line posted under their comment, where everyone can see it, so other readers know the person was answered. For example, say you have sent it to them by DM and it may be in their message requests. |
| Comment Public Reply 2 | `comment_public_reply_2` | A second wording of the same public reply, so repeat replies do not all look the same. One sentence. |
| Comment Public Reply 3 | `comment_public_reply_3` | A third wording of the public reply. One sentence. |
| Comment Private Reply | `comment_private_reply` | The one DM sent when they comment. Copy the message labelled 'Reply, sent when they comment:' from the comment to DM part of your inbound-scripts.md file, or the private reply Instagram sends for you, from the Comment to DM part of ops-workflow.md, which a file made in the app calls Comment-to-DM capture. It only goes to someone who commented first, which is the one message Instagram allows. |
| Comment Button 1 | `comment_button_1` | The words on the first button under the DM: the first of three choices you want people to pick from, for example the thing they ask about most. One to three words, 20 characters or fewer including spaces, because Meta cuts button titles at 20 characters. |
| Comment Button 2 | `comment_button_2` | The words on the second button: a second, different choice. One to three words, 20 characters or fewer including spaces. |
| Comment Button 3 | `comment_button_3` | The words on the third button: a third choice, different from the other two. One to three words, 20 characters or fewer including spaces. |

## B2C DM qualify and book (10)

| Value | Key | What goes in it |
|---|---|---|
| DM Question 1 | `dm_question_1` | The first message in the DM qualify and book part of your ops-workflow.md file. If that file has no DM qualify and book copy, because it names a different pack, use the DM qualify and book part of inbound-scripts.md. If neither has it, write it fresh. The Instagram step offers two buttons, so write it as a question with two answers. |
| DM Question 1 Button 1 | `dm_question_1_button_1` | The answer to question one that carries on. Tapping it sends question two. Take it from the same file. One to three words, 20 characters or fewer including spaces, because Meta cuts button titles at 20 characters. |
| DM Question 1 Button 2 | `dm_question_1_button_2` | The answer to question one that means this is not for them. Tapping it ends the questions: they get the not a fit message, no link and no card. Write it so it is comfortable to tap, such as Just looking. One to three words, 20 characters or fewer. If their file gives three options, fold the other two into one. |
| DM Question 2 | `dm_question_2` | Your second question, from the same part of the file. One or two short sentences, well under 640 characters. Only people who tapped button 1 on question one see it, so it follows on from that answer, and it needs two answers: one that carries on and one that ends it. |
| DM Question 2 Button 1 | `dm_question_2_button_1` | The answer to question two that means they are a fit. Tapping it sends the route message and the link, and puts a card in `In conversation`. One to three words, 20 characters or fewer including spaces. |
| DM Question 2 Button 2 | `dm_question_2_button_2` | The answer to question two that means this is not for them. Tapping it ends the questions the same way button 2 on question one does. One to three words, 20 characters or fewer including spaces. |
| DM Not A Fit Message | `dm_not_a_fit_message` | What is sent to someone who taps button 2 on either question. One or two short sentences: thank them, say where they can find you anyway, such as your page or your posts, and leave the door open. No link, because it is not a booking. No question, because nothing automatic answers a reply to it. It is the last automatic message they get. |
| DM Route Message | `dm_route_message` | The routing message from the same part of the file, without the link. One or two short sentences saying what the link is and what to do next. |
| DM Booking Link | `dm_booking_link` | The full link your routing message points to, starting https://, and nothing else. It is your booking page or your free thing. If it will be a GoHighLevel calendar you have not made yet, leave it blank and paste its link on the day, like `Call Booking Link`. |
| DM Nudge | `dm_nudge` | The single follow-up from the same part of the file. One or two short sentences. |

## B2C Review request (0)

No custom values. This pack's words live in two review templates, not in the custom values list. The values step still writes both, under `## Review request templates` in `ghl-values.md`, so they are ready to paste. Go to `Reputation`, the `Settings` tab, then the email request settings, and open `Set Email Templates`. Write `Review Ask Email` in the `Live` slot and `Review Reminder Email` in the `Retry` slot. Both arrive holding PLACEHOLDER text, neither carries a merge field, and your business name and postal address are typed into the template's own lines rather than merged, never into the words.

**Contact fields this pack brings.** Not copy: they hold information about one person, and the workflow merges them into the message.

| Field | Merge tag | What it holds | Who fills it |
|---|---|---|---|
| Work done | `{{contact.work_done}}` | A few words naming the job you did for that one customer, so the ask does not read as a form letter. Single line. | You, by hand on their contact record, once the work is finished. Nothing fills it by itself. |

