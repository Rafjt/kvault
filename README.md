# kvault


# Run la db de test :

### créer le conteneur 

```bash
docker run --name db -e MYSQL_ROOT_PASSWORD=1234 -p 3306:3306 -d mysql:latest
docker exec -it db
mysql -u root -p (code "1234")
CREATE DATABASE kvault;
```
### Y mettre le contenue de db-scheme.txt
