const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.enviarNotificacao = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");

  const { token, titulo, corpo } = req.body;

  try {
    await admin.messaging().send({
      token: token,
      notification: {
        title: titulo,
        body: corpo
      }
    });

    res.json({ ok: true });

  } catch (e) {
    console.error(e);
    res.status(500).send("Erro ao enviar notificação");
  }
});
