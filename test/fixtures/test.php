<!DOCTYPE html>
<html>
    <head>
        <title>PHP Test</title>
    </head>
    <body>
        <?php echo '<p>Hello World</p>'; ?>
        <p><?php echo htmlspecialchars($_POST["foo"]); ?></p>
        <p><?php echo $_SERVER['REQUEST_METHOD']; ?></p>
    </body>
</html>
