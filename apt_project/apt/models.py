from django.db import models


class AptCoord(models.Model):
    complex_name = models.CharField(max_length=200)
    district = models.CharField(max_length=100)
    road_address = models.CharField(max_length=300, blank=True)
    lat = models.FloatField()
    lng = models.FloatField()

    class Meta:
        unique_together = [('complex_name', 'district')]
        indexes = [models.Index(fields=['district'])]
